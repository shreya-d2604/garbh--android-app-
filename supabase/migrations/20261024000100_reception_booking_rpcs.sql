-- Booking engine (PLAN.md §5.3, §8.4; docs/contracts.md §2). Owner: reception.
--
-- Replaces the NOT_IMPLEMENTED stubs of available_slots, book_appointment,
-- reschedule_appointment, cancel_appointment and set_appointment_status. Signatures are
-- byte-for-byte those of 20261023001200_domain_rpc_stubs.sql.
--
-- Every rule is enforced here, never in the client:
--   availability - time off - active appointments, lead time, advance window, cancel cutoff
--   (patients only), max upcoming (1 unverified / 3 verified), care-team membership, ownership,
--   and the no_doctor_overlap exclusion constraint as the final guard (SQLSTATE 23P01 -> SLOT_TAKEN).
-- Concurrent bookings for one doctor are serialised with a transaction-level advisory lock, so
-- the second caller sees the first one's row and gets a clean SLOT_TAKEN.

----------------------------------------------------------------------------
-- Internal helpers (schema private: never exposed through the API)
----------------------------------------------------------------------------

-- Slot grid check: returns the slot's end when p_starts_at is exactly one of p_doctor's
-- availability slots (wall-clock weekly hours in the hospital timezone), else null.
create function private.slot_end(p_doctor uuid, p_starts_at timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  with loc as (
    select (p_starts_at at time zone coalesce((select h.timezone from public.hospital_settings h where h.id = 1), 'Asia/Kolkata')) as ts
  )
  select p_starts_at + (av.slot_minutes * interval '1 minute')
  from loc
  join public.doctor_availability av
    on av.doctor_id = p_doctor
   and av.weekday = extract(dow from loc.ts)::int
  where extract(epoch from (loc.ts::time - av.start_time)) >= 0
    and mod(extract(epoch from (loc.ts::time - av.start_time)), av.slot_minutes * 60) = 0
    and extract(epoch from (loc.ts::time - av.start_time)) + av.slot_minutes * 60
        <= extract(epoch from (av.end_time - av.start_time))
  order by av.slot_minutes
  limit 1
$$;

create function private.channel_for(p_role public.user_role) returns public.booking_channel
language sql immutable set search_path = '' as $$
  select case p_role
    when 'patient' then 'app'::public.booking_channel
    when 'receptionist' then 'reception'::public.booking_channel
    when 'doctor' then 'doctor'::public.booking_channel
    when 'admin' then 'admin'::public.booking_channel
  end
$$;

-- A linked planned visit goes back to "planned" and loses its appointment.
create function private.release_visit(p_appt uuid) returns void
language sql security definer set search_path = '' as $$
  update public.visits
     set status = 'planned', appointment_id = null
   where appointment_id = p_appt and status = 'scheduled'
$$;

-- Ownership / role check shared by cancel and reschedule. The caller must hold a row lock on
-- the appointment or at least pass its current state.
create function private.assert_appointment_access(p_role public.user_role, p_a public.appointments) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_role = 'patient' then
    if p_a.patient_id is distinct from public.my_patient_id() then
      raise exception 'NOT_ALLOWED' using detail = 'not your appointment';
    end if;
  elsif p_role = 'doctor' then
    if not (p_a.doctor_id = auth.uid() or public.on_care_team(p_a.pregnancy_id)) then
      raise exception 'NOT_ALLOWED' using detail = 'not your patient';
    end if;
  elsif p_role not in ('receptionist', 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;
end $$;

-- Patients may only change an appointment up to patient_cancel_cutoff_hours before its start.
create function private.assert_cancel_cutoff(p_role public.user_role, p_starts_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cutoff smallint;
begin
  if p_role = 'patient' then
    select h.patient_cancel_cutoff_hours into v_cutoff from public.hospital_settings h where h.id = 1;
    if now() > p_starts_at - make_interval(hours => v_cutoff) then
      raise exception 'CANCEL_CUTOFF';
    end if;
  end if;
end $$;

-- The one place where an appointment row is created. Caller (public RPC) has already resolved
-- the role, patient and pregnancy. Order of checks: doctor -> care team -> slot -> time off ->
-- lead/advance (patient) -> max upcoming (patient) -> visit -> free slot -> insert.
create function private.book_core(
  p_role public.user_role, p_patient uuid, p_pregnancy uuid, p_doctor uuid,
  p_starts_at timestamptz, p_visit uuid, p_reason text, p_rescheduled_from uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_set         public.hospital_settings%rowtype;
  v_accepts     boolean;
  v_on_team     boolean;
  v_has_primary boolean;
  v_new_primary boolean := false;
  v_ends        timestamptz;
  v_verified    boolean;
  v_upcoming    int;
  v_limit       int;
  v_visit       public.visits%rowtype;
  v_id          uuid;
begin
  if p_starts_at is null then
    raise exception 'INVALID_INPUT' using detail = 'starts_at is required';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'INVALID_INPUT' using detail = 'reason is too long';
  end if;

  select * into v_set from public.hospital_settings h where h.id = 1;

  select coalesce(s.accepts_new_patients, false) into v_accepts
  from public.profiles p
  left join public.staff_details s on s.profile_id = p.id
  where p.id = p_doctor and p.role = 'doctor' and p.is_active and p.deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'doctor';
  end if;

  -- Serialise every booking for this doctor (released at commit/rollback).
  perform pg_advisory_xact_lock(hashtext('garbh.appointments'), hashtext(p_doctor::text));

  -- Care team, with the first-visit exception (no active primary + doctor accepts new patients).
  select exists (
    select 1 from public.care_team ct
    where ct.pregnancy_id = p_pregnancy and ct.doctor_id = p_doctor and ct.removed_at is null
  ) into v_on_team;
  if not v_on_team then
    select exists (
      select 1 from public.care_team ct
      where ct.pregnancy_id = p_pregnancy and ct.care_role = 'primary' and ct.removed_at is null
    ) into v_has_primary;
    if v_has_primary or p_role = 'doctor' then
      raise exception 'NOT_ON_CARE_TEAM';
    elsif not v_accepts then
      raise exception 'DOCTOR_NOT_ACCEPTING';
    end if;
    v_new_primary := true;
  end if;

  -- The slot must be a real slot of the weekly hours of the doctor, and not during time off.
  v_ends := private.slot_end(p_doctor, p_starts_at);
  if v_ends is null then
    raise exception 'OUTSIDE_AVAILABILITY';
  end if;
  if exists (
    select 1 from public.doctor_time_off o
    where o.doctor_id = p_doctor and tstzrange(o.starts_at, o.ends_at) && tstzrange(p_starts_at, v_ends)
  ) then
    raise exception 'DOCTOR_UNAVAILABLE';
  end if;

  if p_role = 'patient' then
    if p_starts_at < now() + make_interval(hours => v_set.min_lead_hours) then
      raise exception 'TOO_SOON';
    end if;
    if p_starts_at > now() + make_interval(days => v_set.max_advance_days) then
      raise exception 'TOO_FAR_AHEAD';
    end if;
    select pt.verified_at is not null into v_verified from public.patients pt where pt.id = p_patient;
    select count(*) into v_upcoming from public.appointments a
    where a.patient_id = p_patient and a.status in ('booked', 'confirmed') and a.ends_at > now();
    v_limit := case when v_verified then v_set.verified_max_upcoming else v_set.unverified_max_upcoming end;
    if v_upcoming >= v_limit then
      raise exception 'MAX_UPCOMING';
    end if;
  elsif v_ends <= now() then
    -- Staff bypass lead time and advance window, but cannot book a slot that is already over.
    raise exception 'TOO_SOON' using detail = 'slot has already ended';
  end if;

  if p_visit is not null then
    select * into v_visit from public.visits v where v.id = p_visit and v.pregnancy_id = p_pregnancy for update;
    if not found then
      raise exception 'INVALID_INPUT' using detail = 'visit does not belong to the pregnancy';
    end if;
    if v_visit.status not in ('planned', 'missed', 'scheduled')
       or (v_visit.status = 'scheduled' and exists (
             select 1 from public.appointments a
             where a.id = v_visit.appointment_id and a.status not in ('cancelled', 'no_show'))) then
      raise exception 'INVALID_INPUT' using detail = 'visit cannot be booked';
    end if;
  end if;

  if exists (
    select 1 from public.appointments a
    where a.doctor_id = p_doctor and a.status not in ('cancelled', 'no_show')
      and tstzrange(a.starts_at, a.ends_at) && tstzrange(p_starts_at, v_ends)
  ) then
    raise exception 'SLOT_TAKEN';
  end if;

  begin
    if v_new_primary then
      insert into public.care_team (pregnancy_id, doctor_id, care_role, added_by)
      values (p_pregnancy, p_doctor, 'primary', auth.uid());
    end if;
    insert into public.appointments (
      patient_id, pregnancy_id, doctor_id, visit_id, starts_at, ends_at, status, reason,
      booked_by, booking_channel, rescheduled_from
    ) values (
      p_patient, p_pregnancy, p_doctor, p_visit, p_starts_at, v_ends, 'booked', nullif(btrim(p_reason), ''),
      auth.uid(), private.channel_for(p_role), p_rescheduled_from
    ) returning id into v_id;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN';
    when unique_violation then
      -- someone else became primary for this pregnancy in the meantime
      raise exception 'NOT_ON_CARE_TEAM';
  end;

  if p_visit is not null then
    update public.visits set appointment_id = v_id, status = 'scheduled' where id = p_visit;
  end if;
  return v_id;
end $$;

----------------------------------------------------------------------------
-- available_slots(p_doctor, p_from, p_to)
----------------------------------------------------------------------------
create or replace function public.available_slots(p_doctor uuid, p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_role      public.user_role := public.auth_role();
  v_set       public.hospital_settings%rowtype;
  v_patient   uuid;
  v_pregnancy uuid;
  v_min       timestamptz;
  v_max       timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_role is null or v_role = 'companion' then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_doctor is null or p_from is null or p_to is null or p_from > p_to or p_to - p_from > 61 then
    raise exception 'INVALID_INPUT' using detail = 'from/to required, from <= to, at most 62 days';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_doctor and p.role = 'doctor' and p.is_active and p.deleted_at is null
  ) then
    return;
  end if;

  select * into v_set from public.hospital_settings h where h.id = 1;

  if v_role = 'patient' then
    -- Only doctors she may book: her care team, or (no active primary) a doctor taking new patients.
    v_patient := public.my_patient_id();
    select pr.id into v_pregnancy from public.pregnancies pr
    where pr.patient_id = v_patient and pr.status = 'active';
    if v_pregnancy is null then
      return;
    end if;
    if not exists (
      select 1 from public.care_team ct
      where ct.pregnancy_id = v_pregnancy and ct.doctor_id = p_doctor and ct.removed_at is null
    ) then
      if exists (
           select 1 from public.care_team ct
           where ct.pregnancy_id = v_pregnancy and ct.care_role = 'primary' and ct.removed_at is null)
         or not exists (
           select 1 from public.staff_details s where s.profile_id = p_doctor and s.accepts_new_patients) then
        return;
      end if;
    end if;
    v_min := now() + make_interval(hours => v_set.min_lead_hours);
    v_max := now() + make_interval(days => v_set.max_advance_days);
  end if;

  return query
  select s.s_start, s.s_end
  from (
    select distinct
      ((p_from + i.n) + av.start_time + k.n * av.slot_minutes * interval '1 minute') at time zone v_set.timezone as s_start,
      ((p_from + i.n) + av.start_time + (k.n + 1) * av.slot_minutes * interval '1 minute') at time zone v_set.timezone as s_end
    from generate_series(0, p_to - p_from) as i(n)
    join public.doctor_availability av
      on av.doctor_id = p_doctor and av.weekday = extract(dow from p_from + i.n)::int
    cross join lateral generate_series(
      0, floor(extract(epoch from (av.end_time - av.start_time)) / 60 / av.slot_minutes)::int - 1
    ) as k(n)
  ) s
  where (case when v_min is null then s.s_end > now() else s.s_start >= v_min and s.s_start <= v_max end)
    and not exists (
      select 1 from public.doctor_time_off o
      where o.doctor_id = p_doctor and tstzrange(o.starts_at, o.ends_at) && tstzrange(s.s_start, s.s_end))
    and not exists (
      select 1 from public.appointments a
      where a.doctor_id = p_doctor and a.status not in ('cancelled', 'no_show')
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(s.s_start, s.s_end))
  order by s.s_start;
end $$;

----------------------------------------------------------------------------
-- book_appointment
----------------------------------------------------------------------------
create or replace function public.book_appointment(
  p_doctor uuid, p_starts_at timestamptz, p_visit uuid default null,
  p_pregnancy uuid default null, p_reason text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role      public.user_role := public.auth_role();
  v_patient   uuid;
  v_pregnancy uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if v_role = 'patient' then
    v_patient := public.my_patient_id();
    select pr.id into v_pregnancy from public.pregnancies pr
    where pr.patient_id = v_patient and pr.status = 'active';
    if v_pregnancy is null then
      raise exception 'NOT_FOUND' using detail = 'no active pregnancy';
    end if;
    if p_pregnancy is not null and p_pregnancy <> v_pregnancy then
      raise exception 'NOT_ALLOWED' using detail = 'not your pregnancy';
    end if;
  elsif v_role in ('admin', 'receptionist', 'doctor') then
    if p_pregnancy is null then
      raise exception 'INVALID_INPUT' using detail = 'p_pregnancy is required for staff bookings';
    end if;
    select pr.id, pr.patient_id into v_pregnancy, v_patient
    from public.pregnancies pr
    join public.patients pt on pt.id = pr.patient_id and pt.deleted_at is null
    where pr.id = p_pregnancy and pr.status = 'active';
    if v_pregnancy is null then
      raise exception 'NOT_FOUND' using detail = 'no such active pregnancy';
    end if;
    if v_role = 'doctor' and not public.on_care_team(v_pregnancy) then
      raise exception 'NOT_ALLOWED' using detail = 'doctor is not on the care team';
    end if;
  else
    raise exception 'NOT_ALLOWED';
  end if;

  return private.book_core(v_role, v_patient, v_pregnancy, p_doctor, p_starts_at, p_visit, p_reason, null);
end $$;

----------------------------------------------------------------------------
-- cancel_appointment
----------------------------------------------------------------------------
create or replace function public.cancel_appointment(p_appt uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.auth_role();
  v_a    public.appointments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_role is null or v_role = 'companion' then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_a from public.appointments a where a.id = p_appt for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform private.assert_appointment_access(v_role, v_a);
  if v_a.status not in ('booked', 'confirmed') then
    raise exception 'INVALID_STATUS_CHANGE';
  end if;
  perform private.assert_cancel_cutoff(v_role, v_a.starts_at);

  update public.appointments
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_reason = nullif(btrim(p_reason), '')
   where id = p_appt;
  perform private.release_visit(p_appt);
end $$;

----------------------------------------------------------------------------
-- reschedule_appointment: cancel + rebook in one transaction
----------------------------------------------------------------------------
create or replace function public.reschedule_appointment(p_appt uuid, p_new_starts_at timestamptz, p_doctor uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role   public.user_role := public.auth_role();
  v_a      public.appointments%rowtype;
  v_doctor uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_role is null or v_role = 'companion' then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_new_starts_at is null then
    raise exception 'INVALID_INPUT' using detail = 'new start time is required';
  end if;

  select * into v_a from public.appointments a where a.id = p_appt;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  perform private.assert_appointment_access(v_role, v_a);
  v_doctor := coalesce(p_doctor, v_a.doctor_id);

  -- Same lock order as booking (doctor lock first), then the old row.
  perform pg_advisory_xact_lock(hashtext('garbh.appointments'), hashtext(v_doctor::text));
  select * into v_a from public.appointments a where a.id = p_appt for update;
  if v_a.status not in ('booked', 'confirmed') then
    raise exception 'INVALID_STATUS_CHANGE';
  end if;
  perform private.assert_cancel_cutoff(v_role, v_a.starts_at);
  if v_doctor = v_a.doctor_id and p_new_starts_at = v_a.starts_at then
    raise exception 'INVALID_INPUT' using detail = 'nothing to change';
  end if;
  if not exists (select 1 from public.pregnancies pr where pr.id = v_a.pregnancy_id and pr.status = 'active') then
    raise exception 'INVALID_INPUT' using detail = 'pregnancy is not active';
  end if;

  update public.appointments
     set status = 'cancelled', cancelled_by = auth.uid(), cancelled_reason = 'rescheduled'
   where id = p_appt;
  perform private.release_visit(p_appt);

  return private.book_core(
    v_role, v_a.patient_id, v_a.pregnancy_id, v_doctor, p_new_starts_at, v_a.visit_id, v_a.reason, p_appt
  );
end $$;

----------------------------------------------------------------------------
-- set_appointment_status
--   reception/admin: booked -> confirmed | checked_in | no_show; confirmed -> checked_in | no_show
--   doctor (own or care team) / admin: booked | confirmed | checked_in -> in_consultation;
--                                      in_consultation -> completed (linked visit completed)
----------------------------------------------------------------------------
create or replace function public.set_appointment_status(p_appt uuid, p_status public.appt_status) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.auth_role();
  v_a    public.appointments%rowtype;
  v_ok   boolean := false;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_role is null or v_role in ('patient', 'companion') then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_a from public.appointments a where a.id = p_appt for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_role = 'doctor' and not (v_a.doctor_id = auth.uid() or public.on_care_team(v_a.pregnancy_id)) then
    raise exception 'NOT_ALLOWED' using detail = 'not your patient';
  end if;

  if v_role in ('receptionist', 'admin') then
    v_ok := (v_a.status = 'booked' and p_status in ('confirmed', 'checked_in', 'no_show'))
         or (v_a.status = 'confirmed' and p_status in ('checked_in', 'no_show'));
  end if;
  if not v_ok and v_role in ('doctor', 'admin') then
    v_ok := (v_a.status in ('booked', 'confirmed', 'checked_in') and p_status = 'in_consultation')
         or (v_a.status = 'in_consultation' and p_status = 'completed');
  end if;
  if not v_ok then
    raise exception 'INVALID_STATUS_CHANGE';
  end if;

  update public.appointments
     set status = p_status,
         checked_in_at = case when p_status = 'checked_in' then now() else checked_in_at end
   where id = p_appt;

  if p_status = 'completed' then
    update public.visits set status = 'completed'
     where (id = v_a.visit_id or appointment_id = p_appt) and status in ('planned', 'missed', 'scheduled');
  elsif p_status = 'no_show' then
    perform private.release_visit(p_appt);
  end if;
end $$;

----------------------------------------------------------------------------
-- Grants (AGENTS.md §4): nothing for anon, authenticated only.
----------------------------------------------------------------------------
revoke execute on function public.available_slots(uuid, date, date) from public, anon;
grant execute on function public.available_slots(uuid, date, date) to authenticated;
revoke execute on function public.book_appointment(uuid, timestamptz, uuid, uuid, text) from public, anon;
grant execute on function public.book_appointment(uuid, timestamptz, uuid, uuid, text) to authenticated;
revoke execute on function public.reschedule_appointment(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.reschedule_appointment(uuid, timestamptz, uuid) to authenticated;
revoke execute on function public.cancel_appointment(uuid, text) from public, anon;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
revoke execute on function public.set_appointment_status(uuid, public.appt_status) from public, anon;
grant execute on function public.set_appointment_status(uuid, public.appt_status) to authenticated;
