-- Clinical WRITE policies for care-team doctors (PLAN.md §4, §6; AGENTS.md §6). Owner: doctor.
--
-- "Care team" = public.on_care_team(pregnancy_id): the caller is an ACTIVE doctor profile that
-- is an active primary or backup on the pregnancy (removed_at is null). Read policies and
-- `<table>_admin_all` come from the foundation. Nothing here is granted to receptionists,
-- patients or companions, and a doctor who is not on the team matches zero rows on UPDATE /
-- DELETE and gets 42501 on INSERT.
--
-- Guard triggers (BEFORE) protect integrity details a bare policy cannot express (immutable
-- foreign keys, denormalised pregnancy_id, verified_by). They only constrain the
-- `authenticated` role acting as a doctor, so SECURITY DEFINER RPCs, the service role
-- (Edge Functions) and admins are unaffected.

----------------------------------------------------------------------------
-- pregnancies: LMP / dating-scan EDD / risk / G-P-A-L / outcome (closing)
----------------------------------------------------------------------------
create policy pregnancies_doctor_update on public.pregnancies for update to authenticated
  using (public.on_care_team(id))
  with check (public.on_care_team(id));

create function private.guard_pregnancy_doctor_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and public.auth_role() = 'doctor'
     and (new.id is distinct from old.id or new.patient_id is distinct from old.patient_id) then
    raise exception 'NOT_ALLOWED' using detail = 'a pregnancy cannot be moved to another patient';
  end if;
  return new;
end $$;
create trigger guard_pregnancy_doctor_update before update on public.pregnancies
  for each row execute function private.guard_pregnancy_doctor_update();

----------------------------------------------------------------------------
-- patients: care-team doctors may edit MEDICAL fields only
----------------------------------------------------------------------------
create policy patients_doctor_update on public.patients for update to authenticated
  using (public.on_patient_care_team(id))
  with check (public.on_patient_care_team(id));

create function private.guard_patient_doctor_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  -- is_verified is generated (null in NEW inside a BEFORE trigger), so it is excluded too.
  v_allowed text[] := array['blood_group','rh_negative','allergies','chronic_conditions','updated_at','is_verified'];
begin
  if current_user in ('authenticated', 'anon') and public.auth_role() = 'doctor'
     and (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'NOT_ALLOWED' using detail = 'doctors may only edit medical fields';
  end if;
  return new;
end $$;
create trigger guard_patient_doctor_update before update on public.patients
  for each row execute function private.guard_patient_doctor_update();

----------------------------------------------------------------------------
-- visits: extra visits (is_extra + reason_added), move / skip / cancel, edit tests.
-- Doctors only INSERT extras (template visits come from generate_visit_plan /
-- apply_visit_template). Completed visits are medical history and cannot be deleted.
----------------------------------------------------------------------------
create policy visits_doctor_insert on public.visits for insert to authenticated
  with check (public.on_care_team(pregnancy_id) and is_extra and added_by = auth.uid());
create policy visits_doctor_update on public.visits for update to authenticated
  using (public.on_care_team(pregnancy_id))
  with check (public.on_care_team(pregnancy_id));
create policy visits_doctor_delete on public.visits for delete to authenticated
  using (public.on_care_team(pregnancy_id) and status <> 'completed');

----------------------------------------------------------------------------
-- consultations: insert (doctor_id = caller) / update. No delete (clinical record).
----------------------------------------------------------------------------
create policy consultations_doctor_insert on public.consultations for insert to authenticated
  with check (public.on_care_team(pregnancy_id) and doctor_id = auth.uid());
create policy consultations_doctor_update on public.consultations for update to authenticated
  using (public.on_care_team(pregnancy_id))
  with check (public.on_care_team(pregnancy_id));

create function private.guard_consultation_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and public.auth_role() = 'doctor' then
    if tg_op = 'UPDATE' and (new.pregnancy_id is distinct from old.pregnancy_id
                             or new.doctor_id is distinct from old.doctor_id) then
      raise exception 'NOT_ALLOWED' using detail = 'consultation author and pregnancy are fixed';
    end if;
    if new.appointment_id is not null and not exists (
      select 1 from public.appointments a
      where a.id = new.appointment_id and a.pregnancy_id = new.pregnancy_id
    ) then
      raise exception 'INVALID_INPUT' using detail = 'appointment belongs to another pregnancy';
    end if;
  end if;
  return new;
end $$;
create trigger guard_consultation_write before insert or update on public.consultations
  for each row execute function private.guard_consultation_write();

----------------------------------------------------------------------------
-- consultation_private_notes + prescription_items: the denormalised pregnancy_id must match
-- the consultation's, otherwise a row could be filed under a pregnancy the doctor is on while
-- hanging off a consultation of another one.
----------------------------------------------------------------------------
create function private.guard_consultation_child() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and public.auth_role() = 'doctor' and not exists (
    select 1 from public.consultations c
    where c.id = new.consultation_id and c.pregnancy_id = new.pregnancy_id
  ) then
    raise exception 'INVALID_INPUT' using detail = 'consultation belongs to another pregnancy';
  end if;
  return new;
end $$;

create policy consultation_private_notes_doctor_insert on public.consultation_private_notes for insert to authenticated
  with check (public.on_care_team(pregnancy_id));
create policy consultation_private_notes_doctor_update on public.consultation_private_notes for update to authenticated
  using (public.on_care_team(pregnancy_id))
  with check (public.on_care_team(pregnancy_id));
create policy consultation_private_notes_doctor_delete on public.consultation_private_notes for delete to authenticated
  using (public.on_care_team(pregnancy_id));
create trigger guard_consultation_child before insert or update on public.consultation_private_notes
  for each row execute function private.guard_consultation_child();

create policy prescription_items_doctor_insert on public.prescription_items for insert to authenticated
  with check (public.on_care_team(pregnancy_id));
create policy prescription_items_doctor_update on public.prescription_items for update to authenticated
  using (public.on_care_team(pregnancy_id))
  with check (public.on_care_team(pregnancy_id));
create policy prescription_items_doctor_delete on public.prescription_items for delete to authenticated
  using (public.on_care_team(pregnancy_id));
create trigger guard_consultation_child before insert or update on public.prescription_items
  for each row execute function private.guard_consultation_child();

----------------------------------------------------------------------------
-- reports (soft delete via deleted_at, so no DELETE policy) + report_files
----------------------------------------------------------------------------
create policy reports_doctor_insert on public.reports for insert to authenticated
  with check (public.on_care_team(pregnancy_id) and uploaded_by = auth.uid());
create policy reports_doctor_update on public.reports for update to authenticated
  using (public.on_care_team(pregnancy_id))
  with check (public.on_care_team(pregnancy_id));

create function private.guard_report_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and public.auth_role() = 'doctor' then
    if tg_op = 'UPDATE' and new.pregnancy_id is distinct from old.pregnancy_id then
      raise exception 'NOT_ALLOWED' using detail = 'a report cannot be moved to another pregnancy';
    end if;
    if new.consultation_id is not null and not exists (
      select 1 from public.consultations c
      where c.id = new.consultation_id and c.pregnancy_id = new.pregnancy_id
    ) then
      raise exception 'INVALID_INPUT' using detail = 'consultation belongs to another pregnancy';
    end if;
  end if;
  return new;
end $$;
create trigger guard_report_write before insert or update on public.reports
  for each row execute function private.guard_report_write();

-- The report must be visible to the caller (reports_doctor_select = on the care team).
create policy report_files_doctor_insert on public.report_files for insert to authenticated
  with check (exists (
    select 1 from public.reports r where r.id = report_id and public.on_care_team(r.pregnancy_id)));
create policy report_files_doctor_delete on public.report_files for delete to authenticated
  using (exists (
    select 1 from public.reports r where r.id = report_id and public.on_care_team(r.pregnancy_id)));

----------------------------------------------------------------------------
-- lab_results: manual entry (source = 'manual'), edit extracted values, verify, and drop an
-- unverified value (e.g. a mis-extracted row). AI rows are inserted by the Edge Function
-- with the service role, which bypasses RLS.
----------------------------------------------------------------------------
create policy lab_results_doctor_insert on public.lab_results for insert to authenticated
  with check (public.on_care_team(pregnancy_id) and source = 'manual');
create policy lab_results_doctor_update on public.lab_results for update to authenticated
  using (public.on_care_team(pregnancy_id))
  with check (public.on_care_team(pregnancy_id));
create policy lab_results_doctor_delete on public.lab_results for delete to authenticated
  using (public.on_care_team(pregnancy_id) and not verified);

create function private.guard_lab_result_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and public.auth_role() = 'doctor' then
    if tg_op = 'UPDATE' and new.pregnancy_id is distinct from old.pregnancy_id then
      raise exception 'NOT_ALLOWED' using detail = 'a lab result cannot be moved to another pregnancy';
    end if;
    if new.report_id is not null and not exists (
      select 1 from public.reports r where r.id = new.report_id and r.pregnancy_id = new.pregnancy_id
    ) then
      raise exception 'INVALID_INPUT' using detail = 'report belongs to another pregnancy';
    end if;
    -- "verified by" cannot be forged: it is always the verifying doctor.
    new.verified_by := case when new.verified then auth.uid() else null end;
  end if;
  return new;
end $$;
create trigger guard_lab_result_write before insert or update on public.lab_results
  for each row execute function private.guard_lab_result_write();

----------------------------------------------------------------------------
-- apply_visit_template: switch the still-planned visits to a schedule ('standard' or the
-- denser 'high_risk'), PLAN.md §5.4 "with one tap". Keeps completed / scheduled / missed /
-- skipped / extra visits as they are, replaces the `planned` template visits, and only adds
-- template visits whose window has not ended yet and whose target week is not already
-- covered by a kept visit.
----------------------------------------------------------------------------
create function public.apply_visit_template(p_pregnancy uuid, p_schedule text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_start date;   -- day 0 of the pregnancy = edd_final - 280
  v_seq   int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not (public.on_care_team(p_pregnancy) or public.auth_role() = 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_schedule is null or p_schedule not in ('standard', 'high_risk') then
    raise exception 'INVALID_INPUT' using detail = 'unknown schedule';
  end if;

  select pr.edd_final - 280 into v_start from public.pregnancies pr where pr.id = p_pregnancy for update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'pregnancy';
  end if;
  if v_start is null then
    raise exception 'INVALID_INPUT' using detail = 'pregnancy has no due date';
  end if;

  delete from public.visits v
  where v.pregnancy_id = p_pregnancy and v.status = 'planned' and not v.is_extra;

  select coalesce(max(v.seq), 0) into v_seq from public.visits v where v.pregnancy_id = p_pregnancy;

  insert into public.visits (pregnancy_id, seq, target_week, due_from, due_to, title, purpose, recommended_tests)
  select p_pregnancy, v_seq + row_number() over (order by t.seq), t.target_week,
         v_start + t.window_start_week * 7,
         v_start + t.window_end_week * 7 + 6,
         t.title, t.purpose, t.recommended_tests
  from public.visit_templates t
  where t.schedule = p_schedule and t.is_active
    and v_start + t.window_end_week * 7 + 6 >= public.hospital_today()
    and not exists (
      select 1 from public.visits k
      where k.pregnancy_id = p_pregnancy and not k.is_extra and k.target_week = t.target_week
        and k.status in ('scheduled', 'completed')
    )
  order by t.seq;
end $$;

revoke execute on function public.apply_visit_template(uuid, text) from public, anon;
grant execute on function public.apply_visit_template(uuid, text) to authenticated;
