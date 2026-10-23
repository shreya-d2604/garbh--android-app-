-- Admin mutations (PLAN.md §7.6 #3, #5, #7). Owner: admin agent.
--
-- Everything here is admin-only (private.require_admin) and audit-logged: row changes by the
-- existing audit triggers (actor = the admin, via the JWT), plus an explicit audit row that carries
-- the reason for the actions that need one (soft/hard delete, date fixes). The admin_all RLS policies
-- already let an admin edit rows directly (demographics, pregnancy risk/status, catalogs); the RPCs
-- below exist where a reason, validation or atomicity is needed.

----------------------------------------------------------------------------
-- audit helpers
----------------------------------------------------------------------------
create function private.audit_admin(
  p_action text, p_table text, p_record text, p_patient uuid, p_old jsonb, p_new jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id, old, new)
  values (auth.uid(), (select p.role from public.profiles p where p.id = auth.uid()),
          p_action, p_table, p_record, p_patient, p_old, p_new)
$$;

-- Audit trigger for configuration tables whose primary key is not always "id".
create function private.audit_config_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, old, new)
  values (
    auth.uid(),
    (select p.role from public.profiles p where p.id = auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'code', v_row ->> 'key', v_row ->> 'week'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'hospital_settings', 'visit_templates', 'week_content', 'milestones',
    'lab_tests', 'drug_catalog', 'curated_guidance', 'data_requests'
  ] loop
    execute format(
      'create trigger audit_config after insert or update or delete on public.%I
         for each row execute function private.audit_config_row()', t);
  end loop;
end $$;

----------------------------------------------------------------------------
-- Patients
----------------------------------------------------------------------------
-- p_details: { full_name*, mrn*, dob, phone, email, address, blood_group, lmp_date, primary_doctor }
-- A desk-style record: verified on creation. With lmp_date it also creates the active pregnancy
-- (visit plan via trigger); primary_doctor needs lmp_date.
create function public.admin_create_patient(p_details jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name    text := nullif(btrim(p_details ->> 'full_name'), '');
  v_mrn     text := nullif(btrim(p_details ->> 'mrn'), '');
  v_today   date := public.hospital_today();
  v_dob     date;
  v_lmp     date;
  v_doctor  uuid;
  v_patient uuid;
  v_preg    uuid;
begin
  perform private.require_admin();
  if v_name is null or v_mrn is null then
    raise exception 'INVALID_INPUT' using detail = 'full_name and mrn are required';
  end if;
  begin
    v_dob    := nullif(p_details ->> 'dob', '')::date;
    v_lmp    := nullif(p_details ->> 'lmp_date', '')::date;
    v_doctor := nullif(p_details ->> 'primary_doctor', '')::uuid;
  exception when others then
    raise exception 'INVALID_INPUT' using detail = 'dob / lmp_date must be YYYY-MM-DD, primary_doctor a uuid';
  end;
  if v_lmp is not null and (v_lmp > v_today or v_lmp < v_today - 300) then
    raise exception 'INVALID_INPUT' using detail = 'LMP must be within the last 300 days';
  end if;
  if v_doctor is not null and v_lmp is null then
    raise exception 'INVALID_INPUT' using detail = 'a primary doctor needs a pregnancy (lmp_date)';
  end if;
  if v_doctor is not null and not exists (
    select 1 from public.profiles p where p.id = v_doctor and p.role = 'doctor' and p.is_active and p.deleted_at is null
  ) then
    raise exception 'INVALID_INPUT' using detail = 'primary_doctor must be an active doctor';
  end if;

  begin
    insert into public.patients (
      full_name, mrn, dob, phone, email, address, blood_group,
      registration_source, verified_at, verified_by, created_by
    ) values (
      v_name, v_mrn, v_dob,
      nullif(btrim(p_details ->> 'phone'), ''),
      nullif(lower(btrim(p_details ->> 'email')), ''),
      nullif(btrim(p_details ->> 'address'), ''),
      nullif(btrim(p_details ->> 'blood_group'), ''),
      'desk', now(), auth.uid(), auth.uid()
    ) returning id into v_patient;
  exception
    when unique_violation then raise exception 'MRN_TAKEN';
    when check_violation then raise exception 'INVALID_INPUT' using detail = 'invalid blood_group';
  end;

  if v_lmp is not null then
    insert into public.pregnancies (patient_id, lmp_date, lmp_source)
    values (v_patient, v_lmp, 'clinician') returning id into v_preg;
    if v_doctor is not null then
      insert into public.care_team (pregnancy_id, doctor_id, care_role, added_by)
      values (v_preg, v_doctor, 'primary', auth.uid());
    end if;
  end if;
  return v_patient;
end $$;

-- Soft delete (reason required) / restore. The patient disappears from staff lists, loses app access
-- (my_patient_id() ignores deleted patients) and from every data-quality rule; nothing is destroyed.
create function public.admin_set_patient_deleted(p_patient uuid, p_deleted boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_pt public.patients%rowtype;
begin
  perform private.require_admin();
  select * into v_pt from public.patients where id = p_patient for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_deleted then
    if length(btrim(coalesce(p_reason, ''))) < 3 then
      raise exception 'INVALID_INPUT' using detail = 'a reason is required';
    end if;
    if v_pt.deleted_at is not null then
      raise exception 'INVALID_STATUS_CHANGE' using detail = 'already deleted';
    end if;
    update public.patients set deleted_at = now() where id = p_patient;
  else
    if v_pt.deleted_at is null then
      raise exception 'INVALID_STATUS_CHANGE' using detail = 'not deleted';
    end if;
    update public.patients set deleted_at = null where id = p_patient;
  end if;
  perform private.audit_admin(
    'update', 'patients', p_patient::text, p_patient, null,
    jsonb_build_object('event', case when p_deleted then 'soft_delete' else 'restore' end,
                       'reason', nullif(btrim(p_reason), '')));
end $$;

-- Hard delete: removes the patient and everything under her (pregnancies, visits, appointments,
-- consultations, reports, results, summaries, companion links) in one transaction. Reason required;
-- an explicit audit row is written BEFORE the delete (the cascade is audited row by row as well).
-- The linked app account (if any) is deactivated. Returns the storage paths of the report files so the
-- app can remove them from the private 'reports' bucket (SQL must not delete storage objects itself).
create function public.admin_hard_delete_patient(p_patient uuid, p_reason text) returns text[]
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

----------------------------------------------------------------------------
-- Pregnancies
----------------------------------------------------------------------------
-- Fix the LMP / dating-scan EDD (PLAN.md §7.6 #3). Needs a reason. At least one of the two dates.
-- The existing trigger shifts the still-planned visits when the EDD moves (or builds the plan when
-- the pregnancy had no date yet).
create function public.admin_update_pregnancy_dates(
  p_pregnancy uuid, p_lmp_date date, p_edd_usg date, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_pr    public.pregnancies%rowtype;
  v_today date := public.hospital_today();
begin
  perform private.require_admin();
  select * into v_pr from public.pregnancies where id = p_pregnancy for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'INVALID_INPUT' using detail = 'a reason is required';
  end if;
  if p_lmp_date is null and p_edd_usg is null then
    raise exception 'INVALID_INPUT' using detail = 'give an LMP or a dating-scan EDD';
  end if;
  if p_lmp_date is not null and (p_lmp_date > v_today or (v_pr.status = 'active' and p_lmp_date < v_today - 300)) then
    raise exception 'INVALID_INPUT' using detail = 'LMP is not plausible for this pregnancy';
  end if;
  if p_edd_usg is not null and v_pr.status = 'active' and (p_edd_usg < v_today - 14 or p_edd_usg > v_today + 294) then
    raise exception 'INVALID_INPUT' using detail = 'EDD is not plausible for an active pregnancy';
  end if;

  update public.pregnancies
    set lmp_date = p_lmp_date, edd_usg = p_edd_usg, lmp_source = 'clinician'
    where id = p_pregnancy;

  perform private.audit_admin(
    'update', 'pregnancies', p_pregnancy::text, v_pr.patient_id,
    jsonb_build_object('lmp_date', v_pr.lmp_date, 'edd_usg', v_pr.edd_usg),
    jsonb_build_object('event', 'fix_dates', 'reason', btrim(p_reason),
                       'lmp_date', p_lmp_date, 'edd_usg', p_edd_usg));
end $$;

----------------------------------------------------------------------------
-- Care team (PLAN.md §7.6 #3): the admin can change the primary and add / remove backups even when
-- the pregnancy has no primary (which the doctor-owned hand_over_primary cannot express).
----------------------------------------------------------------------------
-- private.require_active_doctor(p_doctor) comes from the doctor migration 20261025000100.

-- New primary. The previous primary stays on the team as a backup when still an active doctor,
-- otherwise she is removed from the team. A doctor who was a backup is promoted.
create function public.admin_set_primary_doctor(p_pregnancy uuid, p_doctor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.care_team%rowtype;
  v_new public.care_team%rowtype;
begin
  perform private.require_admin();
  if not exists (select 1 from public.pregnancies pr where pr.id = p_pregnancy) then
    raise exception 'NOT_FOUND';
  end if;
  perform private.require_active_doctor(p_doctor);

  select * into v_old from public.care_team ct
    where ct.pregnancy_id = p_pregnancy and ct.care_role = 'primary' and ct.removed_at is null for update;
  if found and v_old.doctor_id = p_doctor then
    return;
  end if;
  if found then
    if exists (select 1 from public.profiles p
               where p.id = v_old.doctor_id and p.role = 'doctor' and p.is_active and p.deleted_at is null) then
      update public.care_team set care_role = 'backup', note = coalesce(note, 'Previous primary doctor')
        where id = v_old.id;
    else
      update public.care_team set removed_at = now(), removed_by = auth.uid() where id = v_old.id;
    end if;
  end if;

  select * into v_new from public.care_team ct
    where ct.pregnancy_id = p_pregnancy and ct.doctor_id = p_doctor and ct.removed_at is null for update;
  if found then
    update public.care_team set care_role = 'primary' where id = v_new.id;
  else
    insert into public.care_team (pregnancy_id, doctor_id, care_role, added_by)
    values (p_pregnancy, p_doctor, 'primary', auth.uid());
  end if;
end $$;

create function public.admin_add_backup_doctor(p_pregnancy uuid, p_doctor uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.pregnancies pr where pr.id = p_pregnancy) then
    raise exception 'NOT_FOUND';
  end if;
  perform private.require_active_doctor(p_doctor);
  if exists (select 1 from public.care_team ct
             where ct.pregnancy_id = p_pregnancy and ct.doctor_id = p_doctor and ct.removed_at is null) then
    raise exception 'ALREADY_LINKED';
  end if;
  insert into public.care_team (pregnancy_id, doctor_id, care_role, added_by, note)
  values (p_pregnancy, p_doctor, 'backup', auth.uid(), nullif(btrim(p_note), ''));
end $$;

-- Soft remove (history stays). The primary cannot be removed: set a new primary first.
create function public.admin_remove_care_team_member(p_pregnancy uuid, p_doctor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.care_team%rowtype;
begin
  perform private.require_admin();
  select * into v_row from public.care_team ct
    where ct.pregnancy_id = p_pregnancy and ct.doctor_id = p_doctor and ct.removed_at is null for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_row.care_role = 'primary' then
    raise exception 'INVALID_INPUT' using detail = 'cannot remove the primary doctor; set a new primary first';
  end if;
  update public.care_team set removed_at = now(), removed_by = auth.uid() where id = v_row.id;
end $$;

----------------------------------------------------------------------------
-- DPDP requests (PLAN.md §7.6 #7, §12). Status moves open -> in_progress -> done | rejected.
-- Account deletion is completed through the admin-users Edge Function (action process_deletion),
-- which de-identifies the account and removes app access; this RPC refuses to mark a deletion done.
----------------------------------------------------------------------------
create function public.admin_resolve_data_request(p_request uuid, p_status text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.data_requests%rowtype;
begin
  perform private.require_admin();
  if p_status not in ('in_progress', 'done', 'rejected') then
    raise exception 'INVALID_INPUT' using detail = 'status must be in_progress, done or rejected';
  end if;
  select * into v_req from public.data_requests where id = p_request for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_req.status not in ('open', 'in_progress') then
    raise exception 'INVALID_STATUS_CHANGE' using detail = 'request is already closed';
  end if;
  if v_req.kind = 'deletion' and p_status = 'done' then
    raise exception 'INVALID_STATUS_CHANGE' using detail = 'use the process_deletion action to complete a deletion';
  end if;
  update public.data_requests
    set status = p_status,
        note = coalesce(nullif(btrim(p_note), ''), note),
        resolved_by = case when p_status in ('done', 'rejected') then auth.uid() end,
        resolved_at = case when p_status in ('done', 'rejected') then now() end
    where id = p_request;
end $$;

----------------------------------------------------------------------------
-- grants (the head's CI test fails if anon can execute any public function)
----------------------------------------------------------------------------
revoke execute on function public.admin_create_patient(jsonb) from public, anon;
grant execute on function public.admin_create_patient(jsonb) to authenticated;
revoke execute on function public.admin_set_patient_deleted(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_patient_deleted(uuid, boolean, text) to authenticated;
revoke execute on function public.admin_hard_delete_patient(uuid, text) from public, anon;
grant execute on function public.admin_hard_delete_patient(uuid, text) to authenticated;
revoke execute on function public.admin_update_pregnancy_dates(uuid, date, date, text) from public, anon;
grant execute on function public.admin_update_pregnancy_dates(uuid, date, date, text) to authenticated;
revoke execute on function public.admin_set_primary_doctor(uuid, uuid) from public, anon;
grant execute on function public.admin_set_primary_doctor(uuid, uuid) to authenticated;
revoke execute on function public.admin_add_backup_doctor(uuid, uuid, text) from public, anon;
grant execute on function public.admin_add_backup_doctor(uuid, uuid, text) to authenticated;
revoke execute on function public.admin_remove_care_team_member(uuid, uuid) from public, anon;
grant execute on function public.admin_remove_care_team_member(uuid, uuid) to authenticated;
revoke execute on function public.admin_resolve_data_request(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_data_request(uuid, text, text) to authenticated;
