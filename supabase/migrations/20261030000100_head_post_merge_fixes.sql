-- Post-merge fixes after the review of the six agent branches. Owner: head.
--
--   1. Privacy: the reception "called patient" note moves out of `visits` (which patients and
--      companions can read) into the staff-only table `visit_contacts`.
--   2. RLS gaps: prescription items for companions with `prescriptions` but not `summaries`;
--      a deactivated patient still read her own patients row / edited her profile; a doctor
--      removed from the care team kept reading appointments where she was the doctor.
--   3. Auth: GoTrue's admin createUser writes app_metadata AFTER the insert that
--      private.handle_new_user sees, so staff got role = null. A second trigger on
--      `update of raw_app_meta_data` sets the role; admin_staff_apply loses its workaround.
--   4. Booking race: MAX_UPCOMING was only serialised per doctor, so one patient booking two
--      doctors at the same moment could exceed the limit. Patient bookings now also take a
--      per-patient advisory lock (taken BEFORE the doctor lock; no other path takes both).
--   5. User decisions (2026-10-23):
--      a. the DPDP export excludes doctors' private notes (still audit-logged);
--      b. a patient must be soft-deleted before she can be hard-deleted (SOFT_DELETE_REQUIRED);
--      c. a backup doctor may leave a care team herself; the primary is notified.

----------------------------------------------------------------------------
-- 1. visit_contacts (staff only)
----------------------------------------------------------------------------
create table public.visit_contacts (
  visit_id     uuid primary key references public.visits (id) on delete cascade,
  contacted_at timestamptz not null default now(),
  contact_note text check (char_length(contact_note) <= 500),
  contacted_by uuid references public.profiles (id) on delete set null
);
alter table public.visit_contacts enable row level security;
revoke all on public.visit_contacts from anon;

create policy visit_contacts_admin_all on public.visit_contacts for all to authenticated
  using (public.auth_role() = 'admin') with check (public.auth_role() = 'admin');
create policy visit_contacts_reception_select on public.visit_contacts for select to authenticated
  using (public.auth_role() = 'receptionist');
-- The visits subselect runs under the caller's RLS: care-team doctors only.
create policy visit_contacts_doctor_select on public.visit_contacts for select to authenticated
  using (public.auth_role() = 'doctor'
         and exists (select 1 from public.visits v where v.id = visit_id and public.on_care_team(v.pregnancy_id)));

create trigger audit_row after insert or update or delete on public.visit_contacts
  for each row execute function private.audit_row();

insert into public.visit_contacts (visit_id, contacted_at, contact_note)
  select v.id, v.contacted_at, v.contact_note from public.visits v where v.contacted_at is not null;
alter table public.visits drop column contact_note, drop column contacted_at;

create or replace function public.mark_visit_contacted(p_visit uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if public.auth_role() is null or public.auth_role() not in ('receptionist', 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'INVALID_INPUT' using detail = 'note is too long';
  end if;
  if not exists (select 1 from public.visits v where v.id = p_visit) then
    raise exception 'NOT_FOUND';
  end if;
  insert into public.visit_contacts (visit_id, contacted_at, contact_note, contacted_by)
  values (p_visit, now(), nullif(btrim(p_note), ''), auth.uid())
  on conflict (visit_id) do update
    set contacted_at = excluded.contacted_at, contact_note = excluded.contact_note,
        contacted_by = excluded.contacted_by;
end $$;

----------------------------------------------------------------------------
-- 2. RLS gaps
----------------------------------------------------------------------------
-- (a) Evaluated as the function owner, so the companion's own consultations RLS (which needs
--     `summaries`) no longer hides published consultations from a `prescriptions`-only companion.
create function public.consultation_is_published(p_consultation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.consultations c where c.id = p_consultation and c.published_at is not null)
$$;
revoke execute on function public.consultation_is_published(uuid) from public, anon;
grant execute on function public.consultation_is_published(uuid) to authenticated;

drop policy prescription_items_published_select on public.prescription_items;
create policy prescription_items_published_select on public.prescription_items for select to authenticated
  using (public.can_view_pregnancy(pregnancy_id, 'prescriptions')
         and public.consultation_is_published(consultation_id));

-- (b) Deactivated / soft-deleted users: no patients row, no profile edits. profiles_self_select
--     stays: the app must read is_active to show the "account deactivated" notice (PLAN §7.1).
drop policy patients_self_select on public.patients;
create policy patients_self_select on public.patients for select to authenticated
  using (user_id = auth.uid() and public.auth_role() = 'patient');
drop policy profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid() and is_active and deleted_at is null)
  with check (id = auth.uid() and is_active and deleted_at is null);

-- (c) appointments_viewer_select already covers care-team doctors; the "own appointments"
--     policy only added access for doctors who had been removed from the team.
drop policy appointments_doctor_own_select on public.appointments;

----------------------------------------------------------------------------
-- 3. Role from app_metadata written after the insert (GoTrue admin createUser)
----------------------------------------------------------------------------
create function private.handle_user_app_role() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role;
begin
  begin
    v_role := nullif(new.raw_app_meta_data ->> 'role', '')::public.user_role;
  exception when invalid_text_representation then
    return new;
  end;
  -- Only fills a role that was never set: role changes go through admin_staff_apply.
  if v_role is not null then
    update public.profiles set role = v_role where id = new.id and role is null;
  end if;
  return new;
end $$;

create trigger on_auth_user_app_role_updated
  after update of raw_app_meta_data on auth.users
  for each row
  when (new.raw_app_meta_data ->> 'role' is distinct from old.raw_app_meta_data ->> 'role')
  execute function private.handle_user_app_role();

-- admin_staff_apply without the "fresh account" workaround: the profile now has its role.
create or replace function public.admin_staff_apply(p_actor uuid, p_user uuid, p_args jsonb, p_event text default 'staff_update')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_target   public.profiles%rowtype;
  v_new_role public.user_role;
  v_active   boolean;
begin
  perform private.require_active_admin(p_actor);
  if p_event not in ('staff_create', 'staff_update', 'staff_set_role', 'staff_set_active') then
    raise exception 'INVALID_INPUT' using detail = 'unknown event';
  end if;
  select * into v_target from public.profiles where id = p_user for update;
  if not found or v_target.deleted_at is not null then
    raise exception 'NOT_FOUND';
  end if;
  if v_target.role is null or v_target.role not in ('admin', 'doctor', 'receptionist') then
    raise exception 'INVALID_INPUT' using detail = 'only staff accounts can be managed here';
  end if;

  perform private.act_as(p_actor);

  if p_args ? 'role' then
    begin
      v_new_role := (p_args ->> 'role')::public.user_role;
    exception when others then
      raise exception 'INVALID_INPUT' using detail = 'unknown role';
    end;
    if v_new_role not in ('admin', 'doctor', 'receptionist') then
      raise exception 'INVALID_INPUT' using detail = 'staff roles are admin, doctor and receptionist';
    end if;
    if v_new_role <> v_target.role then
      if p_user = p_actor then
        raise exception 'INVALID_INPUT' using detail = 'you cannot change your own role';
      end if;
      if v_target.role = 'admin' and v_target.is_active and private.active_admin_count() <= 1 then
        raise exception 'INVALID_INPUT' using detail = 'cannot demote the last active admin';
      end if;
      update public.profiles set role = v_new_role where id = p_user;
    end if;
  end if;

  if p_args ? 'is_active' then
    begin
      v_active := (p_args ->> 'is_active')::boolean;
    exception when others then
      raise exception 'INVALID_INPUT' using detail = 'is_active must be true or false';
    end;
    if v_active is null then
      raise exception 'INVALID_INPUT' using detail = 'is_active must be true or false';
    end if;
    if not v_active then
      if p_user = p_actor then
        raise exception 'INVALID_INPUT' using detail = 'you cannot deactivate yourself';
      end if;
      if v_target.role = 'admin' and v_target.is_active and private.active_admin_count() <= 1 then
        raise exception 'INVALID_INPUT' using detail = 'cannot deactivate the last active admin';
      end if;
    end if;
    update public.profiles set is_active = v_active where id = p_user;
  end if;

  if (p_args ? 'full_name') or (p_args ? 'phone') then
    update public.profiles
      set full_name = case when p_args ? 'full_name' then coalesce(nullif(btrim(p_args ->> 'full_name'), ''), full_name) else full_name end,
          phone     = case when p_args ? 'phone' then nullif(btrim(p_args ->> 'phone'), '') else phone end
      where id = p_user;
  end if;

  if (p_args ? 'designation') or (p_args ? 'specialization') or (p_args ? 'registration_no')
     or (p_args ? 'bio') or (p_args ? 'accepts_new_patients') or p_event = 'staff_create' then
    insert into public.staff_details (profile_id, designation, specialization, registration_no, bio, accepts_new_patients)
    values (
      p_user,
      nullif(btrim(p_args ->> 'designation'), ''),
      nullif(btrim(p_args ->> 'specialization'), ''),
      nullif(btrim(p_args ->> 'registration_no'), ''),
      nullif(btrim(p_args ->> 'bio'), ''),
      coalesce((p_args ->> 'accepts_new_patients')::boolean, false)
    )
    on conflict (profile_id) do update set
      designation          = case when p_args ? 'designation' then nullif(btrim(p_args ->> 'designation'), '') else public.staff_details.designation end,
      specialization       = case when p_args ? 'specialization' then nullif(btrim(p_args ->> 'specialization'), '') else public.staff_details.specialization end,
      registration_no      = case when p_args ? 'registration_no' then nullif(btrim(p_args ->> 'registration_no'), '') else public.staff_details.registration_no end,
      bio                  = case when p_args ? 'bio' then nullif(btrim(p_args ->> 'bio'), '') else public.staff_details.bio end,
      accepts_new_patients = case when p_args ? 'accepts_new_patients' then (p_args ->> 'accepts_new_patients')::boolean else public.staff_details.accepts_new_patients end;
  end if;

  -- Field NAMES only: the changed values are in the row-level audit entries.
  perform private.audit_admin(
    case when p_event = 'staff_create' then 'insert' else 'update' end,
    'profiles', p_user::text, null, null,
    jsonb_build_object('event', p_event, 'fields', (select coalesce(jsonb_agg(k order by k), '[]') from jsonb_object_keys(p_args) k)));
end $$;
revoke execute on function public.admin_staff_apply(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_staff_apply(uuid, uuid, jsonb, text) to service_role;

----------------------------------------------------------------------------
-- 4. book_appointment: per-patient lock for the MAX_UPCOMING check (signature unchanged)
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
    -- Serialise this patient's bookings (released at commit) so two parallel bookings with
    -- different doctors cannot both pass the max-upcoming count. Taken before the doctor lock.
    perform pg_advisory_xact_lock(hashtext('garbh.patient_booking'), hashtext(v_patient::text));
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
revoke execute on function public.book_appointment(uuid, timestamptz, uuid, uuid, text) from public, anon;
grant execute on function public.book_appointment(uuid, timestamptz, uuid, uuid, text) to authenticated;

----------------------------------------------------------------------------
-- 5a. DPDP export without doctors' private notes (user decision). Signature unchanged.
----------------------------------------------------------------------------
create or replace function public.admin_export_patient_data(p_actor uuid, p_patient uuid default null, p_user uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_patient public.patients%rowtype;
  v_user    uuid := p_user;
  v_preg    uuid[];
  v_out     jsonb;
begin
  perform private.require_active_admin(p_actor);
  if (p_patient is null) = (p_user is null) then
    raise exception 'INVALID_INPUT' using detail = 'give exactly one of patient or user';
  end if;

  if p_patient is not null then
    select * into v_patient from public.patients where id = p_patient;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    v_user := v_patient.user_id;
  else
    select * into v_patient from public.patients where user_id = p_user;
    if not found and not exists (select 1 from public.profiles p where p.id = p_user) then
      raise exception 'NOT_FOUND';
    end if;
  end if;

  select coalesce(array_agg(pr.id), '{}') into v_preg from public.pregnancies pr where pr.patient_id = v_patient.id;

  -- consultation_private_notes are deliberately NOT exported: they are the doctor's working
  -- notes, never shown to the patient in the app (decision of 2026-10-23).
  v_out := jsonb_build_object(
    'format_version', 2,
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_user),
    'patient', case when v_patient.id is null then null else to_jsonb(v_patient) end,
    'pregnancies', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.pregnancies x where x.patient_id = v_patient.id), '[]'),
    'care_team', coalesce((select jsonb_agg(to_jsonb(x) order by x.added_at) from public.care_team x where x.pregnancy_id = any (v_preg)), '[]'),
    'visits', coalesce((select jsonb_agg(to_jsonb(x) order by x.seq) from public.visits x where x.pregnancy_id = any (v_preg)), '[]'),
    'appointments', coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from public.appointments x where x.patient_id = v_patient.id), '[]'),
    'consultations', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.consultations x where x.pregnancy_id = any (v_preg)), '[]'),
    'prescription_items', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.prescription_items x where x.pregnancy_id = any (v_preg)), '[]'),
    'reports', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.reports x where x.pregnancy_id = any (v_preg)), '[]'),
    'report_files', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.report_files f
                              join public.reports r on r.id = f.report_id where r.pregnancy_id = any (v_preg)), '[]'),
    'lab_results', coalesce((select jsonb_agg(to_jsonb(x) order by x.observed_on, x.created_at) from public.lab_results x where x.pregnancy_id = any (v_preg)), '[]'),
    'ai_summaries', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.ai_summaries x where x.pregnancy_id = any (v_preg)), '[]'),
    'companion_links', coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at) from public.companion_links x
                                 where x.patient_id = v_patient.id or x.companion_user_id = v_user), '[]'),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.notifications x where x.user_id = v_user), '[]'),
    'data_requests', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.data_requests x where x.user_id = v_user), '[]'),
    'access_log', coalesce((
      select jsonb_agg(jsonb_build_object('at', a.at, 'actor_role', a.actor_role, 'action', a.action, 'table', a.table_name) order by a.at desc)
      from (select * from public.audit_log l where l.patient_id = v_patient.id order by l.at desc limit 5000) a), '[]')
  );

  perform private.act_as(p_actor);
  perform private.audit_admin(
    'export', 'patients', v_patient.id::text, v_patient.id, null,
    jsonb_build_object('event', 'dpdp_export', 'subject_user', v_user));
  return v_out;
end $$;
revoke execute on function public.admin_export_patient_data(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_export_patient_data(uuid, uuid, uuid) to service_role;

----------------------------------------------------------------------------
-- 5b. Hard delete only after a soft delete (user decision). Signature unchanged.
----------------------------------------------------------------------------
create or replace function public.admin_hard_delete_patient(p_patient uuid, p_reason text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_pt    public.patients%rowtype;
  v_paths text[];
begin
  perform private.require_admin();
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'INVALID_INPUT' using detail = 'a reason of at least 5 characters is required';
  end if;
  select * into v_pt from public.patients where id = p_patient for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_pt.deleted_at is null then
    raise exception 'SOFT_DELETE_REQUIRED' using detail = 'remove (soft-delete) the patient first';
  end if;

  select coalesce(array_agg(rf.storage_path order by rf.storage_path), '{}') into v_paths
  from public.report_files rf
  join public.reports r on r.id = rf.report_id
  join public.pregnancies pr on pr.id = r.pregnancy_id
  where pr.patient_id = p_patient;

  perform private.audit_admin(
    'delete', 'patients', p_patient::text, p_patient,
    jsonb_build_object('mrn', v_pt.mrn),
    jsonb_build_object('event', 'hard_delete', 'reason', btrim(p_reason), 'storage_paths', to_jsonb(v_paths)));

  if v_pt.user_id is not null then
    update public.profiles set is_active = false, deleted_at = coalesce(deleted_at, now())
    where id = v_pt.user_id and role = 'patient';
  end if;

  delete from public.patients where id = p_patient;
  return v_paths;
end $$;
revoke execute on function public.admin_hard_delete_patient(uuid, text) from public, anon;
grant execute on function public.admin_hard_delete_patient(uuid, text) to authenticated;

----------------------------------------------------------------------------
-- 5c. A backup doctor may leave a care team (user decision). Signature unchanged.
--     The primary cannot leave (hand over first); everything else as before.
----------------------------------------------------------------------------
create or replace function public.remove_care_team_member(p_pregnancy uuid, p_doctor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_member public.care_team%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_doctor = auth.uid() and public.auth_role() = 'doctor' and exists (
       select 1 from public.care_team ct
       where ct.pregnancy_id = p_pregnancy and ct.doctor_id = p_doctor
         and ct.removed_at is null and ct.care_role = 'backup') then
    -- Self-removal of a backup: same pregnancy lock as the manager path.
    perform 1 from public.pregnancies pr where pr.id = p_pregnancy for update;
  else
    perform private.require_care_team_manager(p_pregnancy);
  end if;

  select * into v_member from public.care_team ct
  where ct.pregnancy_id = p_pregnancy and ct.doctor_id = p_doctor and ct.removed_at is null;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'not on the care team';
  end if;
  if v_member.care_role = 'primary' then
    raise exception 'INVALID_INPUT' using detail = 'hand over the primary role before removing';
  end if;

  update public.care_team set removed_at = now(), removed_by = auth.uid() where id = v_member.id;
end $$;
revoke execute on function public.remove_care_team_member(uuid, uuid) from public, anon;
grant execute on function public.remove_care_team_member(uuid, uuid) to authenticated;

-- Care-team notifications: as before, plus "a backup left" to the active primary.
create or replace function private.trg_care_team_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_body text; v_route text;
begin
  begin
    if tg_op = 'UPDATE' and new.removed_at is not null and old.removed_at is null
       and new.removed_by is not distinct from new.doctor_id then
      perform private.notify_user(ct.doctor_id, 'care_team_changed', 'Care team update',
                                  'A backup doctor has left a patient''s care team.',
                                  jsonb_build_object('route', '/doctor/patient/' || new.pregnancy_id,
                                                     'pregnancy_id', new.pregnancy_id))
      from public.care_team ct
      where ct.pregnancy_id = new.pregnancy_id and ct.care_role = 'primary' and ct.removed_at is null;
      return null;
    end if;
    if new.doctor_id is not distinct from auth.uid() then
      return null;
    end if;
    v_route := '/doctor/patient/' || new.pregnancy_id;
    if tg_op = 'INSERT' then
      if new.removed_at is not null then
        return null;
      elsif new.care_role = 'backup' then
        v_body := 'You were added as a backup doctor for a patient.';
      elsif exists (select 1 from public.care_team c where c.pregnancy_id = new.pregnancy_id and c.id <> new.id) then
        v_body := 'You are now the primary doctor for a patient.';
      else
        return null;
      end if;
    elsif new.removed_at is not null and old.removed_at is null then
      v_body := 'You were removed from a patient''s care team.';
      v_route := '/doctor/patients';
    elsif new.removed_at is null and new.care_role is distinct from old.care_role then
      v_body := case new.care_role
        when 'primary' then 'You are now the primary doctor for a patient.'
        else 'Primary care of a patient was handed over. You remain on the care team as a backup.' end;
    else
      return null;
    end if;
    perform private.notify_user(new.doctor_id, 'care_team_changed', 'Care team update', v_body,
                                jsonb_build_object('route', v_route, 'pregnancy_id', new.pregnancy_id));
  exception when others then
    raise warning 'care team notification failed (%)', sqlstate;
  end;
  return null;
end $$;
