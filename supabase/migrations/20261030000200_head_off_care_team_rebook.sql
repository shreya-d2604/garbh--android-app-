-- Off-care-team appointments (user decision 2026-10-23). Owner: head.
--
-- When a doctor leaves a pregnancy's care team (remove_care_team_member, a backup leaving,
-- admin_remove_care_team_member, admin_set_primary_doctor dropping an inactive primary), her
-- FUTURE appointments with that patient are NOT cancelled. Instead:
--   1. reception's "Doctor unavailable" worklist lists them, next to the time-off clashes,
--      through one staff-only function: public.appointments_needing_rebook();
--   2. the patient (and approved companions with `appointments` + notifications on) get ONE
--      "please rebook" notification per affected appointment (trigger on care_team.removed_at).
-- The patient app shows a banner on those appointments (it reads its own care team).
-- reschedule_appointment already accepts a new care-team doctor (p_doctor), so no change there.

----------------------------------------------------------------------------
-- 1. Worklist: future active appointments that need a new time or doctor.
--    One row per appointment. off_care_team = the doctor is no longer on the pregnancy's
--    active care team; time_off_* = the first time-off window of the doctor it overlaps.
--    Invoker rights: RLS applies on top of the explicit receptionist/admin check.
----------------------------------------------------------------------------
create function public.appointments_needing_rebook()
returns table (
  appointment_id     uuid,
  off_care_team      boolean,
  time_off_id        uuid,
  time_off_starts_at timestamptz,
  time_off_ends_at   timestamptz,
  time_off_reason    text
)
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if public.auth_role() is distinct from 'receptionist' and public.auth_role() is distinct from 'admin' then
    raise exception 'NOT_ALLOWED';
  end if;

  return query
  select x.id, x.off_team, x.o_id, x.o_starts, x.o_ends, x.o_reason
  from (
    select a.id, a.starts_at,
           not exists (
             select 1 from public.care_team ct
             where ct.pregnancy_id = a.pregnancy_id and ct.doctor_id = a.doctor_id and ct.removed_at is null
           ) as off_team,
           o.id as o_id, o.starts_at as o_starts, o.ends_at as o_ends, o.reason as o_reason
    from public.appointments a
    left join lateral (
      select t.id, t.starts_at, t.ends_at, t.reason
      from public.doctor_time_off t
      where t.doctor_id = a.doctor_id
        and tstzrange(t.starts_at, t.ends_at) && tstzrange(a.starts_at, a.ends_at)
      order by t.starts_at
      limit 1
    ) o on true
    where a.status in ('booked', 'confirmed') and a.ends_at > now()
  ) x
  where x.off_team or x.o_id is not null
  order by x.starts_at
  limit 500;
end $$;

revoke execute on function public.appointments_needing_rebook() from public, anon;
grant execute on function public.appointments_needing_rebook() to authenticated;

----------------------------------------------------------------------------
-- 2. "Please rebook" notification when a doctor leaves the care team.
--    Same shape as the time-off notice (type appointment_changed, deep link to the
--    appointment); data.off_care_team = the doctor's id makes it idempotent per appointment.
--    Never breaks the care-team write (failure -> WARNING with the SQLSTATE only).
----------------------------------------------------------------------------
create function private.trg_care_team_removed_rebook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r     record;
  v_doc text;
  v_when text;
begin
  begin
    if old.removed_at is not null or new.removed_at is null then
      return null;
    end if;
    -- Still (or again) on the team through another active row: nothing to rebook.
    if exists (
      select 1 from public.care_team ct
      where ct.pregnancy_id = new.pregnancy_id and ct.doctor_id = new.doctor_id and ct.removed_at is null
    ) then
      return null;
    end if;
    select coalesce(p.full_name, 'Your doctor') into v_doc from public.profiles p where p.id = new.doctor_id;
    v_doc := coalesce(v_doc, 'Your doctor');

    for r in
      select a.id, a.patient_id, a.starts_at
      from public.appointments a
      where a.pregnancy_id = new.pregnancy_id and a.doctor_id = new.doctor_id
        and a.status in ('booked', 'confirmed') and a.ends_at > now()
        and not exists (
          select 1 from public.notifications n
          where n.type = 'appointment_changed' and n.data ->> 'appointment_id' = a.id::text
            and n.data ? 'off_care_team')
    loop
      v_when := private.fmt_when(r.starts_at);
      perform private.notify_patient_side(
        r.patient_id, 'appointment_changed', 'Please rebook your visit',
        format('%s is no longer on your care team. Please rebook your visit on %s with a doctor on your care team.', v_doc, v_when),
        '%s''s visit on ' || v_when || ' needs to be rebooked with a doctor on her care team.',
        '/patient/appointments/' || r.id, '/companion/' || r.patient_id || '/appointments', 'appointments',
        jsonb_build_object('appointment_id', r.id, 'off_care_team', new.doctor_id));
    end loop;
  exception when others then
    raise warning 'off-care-team notification failed (%)', sqlstate;
  end;
  return null;
end $$;

create trigger care_team_removed_rebook
  after update of removed_at on public.care_team
  for each row execute function private.trg_care_team_removed_rebook();
