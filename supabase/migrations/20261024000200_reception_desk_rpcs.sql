-- Front-desk RPCs and policies (PLAN.md §5.3, §7.5, §8.3; docs/contracts.md §2). Owner: reception.
--
-- verify_patient / merge_patients replace the stubs (signatures unchanged). New: register_patient,
-- mark_visit_contacted, next_mrn. Receptionists get an UPDATE policy on patients for demographics
-- only; identity and verification fields are protected by a trigger. Appointments get no direct
-- write policies: all writes go through the booking RPCs.

----------------------------------------------------------------------------
-- patients: receptionist may edit demographics, nothing else
----------------------------------------------------------------------------
create policy patients_reception_update on public.patients for update to authenticated
  using (public.auth_role() = 'receptionist')
  with check (public.auth_role() = 'receptionist');

create function private.guard_patient_reception_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and public.auth_role() = 'receptionist'
     and (new.id is distinct from old.id
          or new.user_id is distinct from old.user_id
          or new.mrn is distinct from old.mrn
          or new.registration_source is distinct from old.registration_source
          or new.verified_at is distinct from old.verified_at
          or new.verified_by is distinct from old.verified_by
          or new.consent_ai_at is distinct from old.consent_ai_at
          or new.consent_data_at is distinct from old.consent_data_at
          or new.created_by is distinct from old.created_by
          or new.created_at is distinct from old.created_at
          or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'NOT_ALLOWED' using detail = 'receptionists may only edit patient demographics';
  end if;
  return new;
end $$;

create trigger guard_patient_reception_update before update on public.patients
  for each row execute function private.guard_patient_reception_update();

----------------------------------------------------------------------------
-- Hospital numbers: GH-0001, GH-0002, ... (suggestion only; uniqueness is enforced by the column)
----------------------------------------------------------------------------
create function private.next_mrn() returns text
language sql stable security definer set search_path = '' as $$
  select 'GH-' || lpad((coalesce(max(substr(p.mrn, 4)::int), 0) + 1)::text, 4, '0')
  from public.patients p
  where p.mrn ~ '^GH-[0-9]{1,9}$'
$$;

create function public.next_mrn() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if public.auth_role() not in ('receptionist', 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;
  return private.next_mrn();
end $$;

----------------------------------------------------------------------------
-- merge_patients: moves everything from p_source to p_target, then soft-deletes the source.
-- Internal worker without role checks (also used by verify_patient).
----------------------------------------------------------------------------
create function private.merge_core(p_source uuid, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.patients%rowtype;
  v_tgt public.patients%rowtype;
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'INVALID_INPUT' using detail = 'source and target must be two different patients';
  end if;

  -- lock both rows in a stable order
  perform 1 from public.patients where id in (p_source, p_target) order by id for update;
  select * into v_src from public.patients where id = p_source and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'source patient';
  end if;
  select * into v_tgt from public.patients where id = p_target and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'target patient';
  end if;
  if v_src.user_id is not null and v_tgt.user_id is not null then
    raise exception 'INVALID_INPUT' using detail = 'both records already belong to an app account';
  end if;

  -- Pregnancies: the source's active one only stays active when the target has none.
  if exists (select 1 from public.pregnancies pr where pr.patient_id = p_target and pr.status = 'active') then
    update public.pregnancies
       set status = 'closed', outcome_notes = coalesce(outcome_notes, 'Closed when a duplicate record was merged')
     where patient_id = p_source and status = 'active';
  end if;
  update public.pregnancies set patient_id = p_target where patient_id = p_source;
  update public.appointments set patient_id = p_target where patient_id = p_source;

  -- Companions: drop links that would duplicate an open link on the target, move the rest.
  update public.companion_links l
     set status = 'revoked', decided_at = now()
   where l.patient_id = p_source and l.status in ('pending', 'approved')
     and exists (
       select 1 from public.companion_links t
       where t.patient_id = p_target and t.companion_user_id = l.companion_user_id and t.status in ('pending', 'approved'));
  update public.companion_links set patient_id = p_target where patient_id = p_source;
  update public.companion_invites set patient_id = p_target where patient_id = p_source;

  -- Source goes first (user_id is unique), then the target takes over the account and fills gaps.
  update public.patients set user_id = null, deleted_at = now() where id = p_source;
  update public.patients
     set user_id         = coalesce(user_id, v_src.user_id),
         email           = coalesce(email, v_src.email),
         phone           = coalesce(phone, v_src.phone),
         dob             = coalesce(dob, v_src.dob),
         consent_ai_at   = coalesce(consent_ai_at, v_src.consent_ai_at),
         consent_data_at = coalesce(consent_data_at, v_src.consent_data_at),
         allergies       = array(select distinct a from unnest(allergies || v_src.allergies) a),
         chronic_conditions = array(select distinct c from unnest(chronic_conditions || v_src.chronic_conditions) c)
   where id = p_target;
end $$;

create or replace function public.merge_patients(p_source uuid, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.auth_role();
  v_src  public.patients%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_role is null or v_role not in ('receptionist', 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_src from public.patients where id = p_source and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'source patient';
  end if;
  -- Reception may only merge a self-registered record that is still unverified.
  if v_role = 'receptionist' and (v_src.verified_at is not null or v_src.registration_source <> 'app') then
    raise exception 'NOT_ALLOWED' using detail = 'receptionists may only merge unverified app records';
  end if;

  perform private.merge_core(p_source, p_target);
end $$;

----------------------------------------------------------------------------
-- verify_patient: assign the MRN and stamp verification (optionally merging into a desk record)
----------------------------------------------------------------------------
create or replace function public.verify_patient(p_patient uuid, p_mrn text, p_merge_into uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.auth_role();
  v_mrn  text := nullif(btrim(p_mrn), '');
  v_src  public.patients%rowtype;
  v_tgt  public.patients%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_role is null or v_role not in ('receptionist', 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_mrn is null then
    raise exception 'INVALID_INPUT' using detail = 'MRN is required';
  end if;

  select * into v_src from public.patients where id = p_patient and deleted_at is null for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_src.verified_at is not null then
    raise exception 'INVALID_INPUT' using detail = 'patient is already verified';
  end if;

  if p_merge_into is null then
    if exists (select 1 from public.patients p where p.mrn = v_mrn and p.id <> p_patient) then
      raise exception 'MRN_TAKEN';
    end if;
    begin
      update public.patients set mrn = v_mrn, verified_at = now(), verified_by = auth.uid() where id = p_patient;
    exception when unique_violation then
      raise exception 'MRN_TAKEN';
    end;
    return;
  end if;

  if v_role = 'receptionist' and v_src.registration_source <> 'app' then
    raise exception 'NOT_ALLOWED' using detail = 'receptionists may only merge unverified app records';
  end if;
  select * into v_tgt from public.patients where id = p_merge_into and deleted_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using detail = 'target patient';
  end if;
  if v_tgt.mrn is not null and v_tgt.mrn <> v_mrn then
    raise exception 'INVALID_INPUT' using detail = 'target already has a different MRN';
  end if;
  if exists (select 1 from public.patients p where p.mrn = v_mrn and p.id <> p_merge_into) then
    raise exception 'MRN_TAKEN';
  end if;

  -- Stamp the self-registered record first so the account owner is notified of the verification
  -- (the notification trigger watches patients.verified_at going from null to a value).
  update public.patients set verified_at = now(), verified_by = auth.uid() where id = p_patient;
  perform private.merge_core(p_patient, p_merge_into);
  begin
    update public.patients
       set mrn = v_mrn,
           verified_at = coalesce(verified_at, now()),
           verified_by = coalesce(verified_by, auth.uid())
     where id = p_merge_into;
  exception when unique_violation then
    raise exception 'MRN_TAKEN';
  end;
end $$;

----------------------------------------------------------------------------
-- register_patient: desk walk-in. One transaction: verified patient (+ MRN), active pregnancy
-- (lmp_source = clinician), primary doctor on the care team. The visit plan comes from the
-- pregnancy trigger. The duplicate check is a separate query in the app.
--   p_details: { full_name*, consent* (true), lmp_date* | edd_date*, primary_doctor* (uuid),
--                mrn (blank = next number), dob, phone, email, address, blood_group,
--                allergies: text[], chronic_conditions: text[], emergency_contact,
--                gravida, para, abortus, living }
----------------------------------------------------------------------------
create function public.register_patient(p_details jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role    public.user_role := public.auth_role();
  v_name    text;
  v_mrn     text;
  v_email   text;
  v_blood   text;
  v_lmp     date;
  v_dob     date;
  v_doctor  uuid;
  v_consent boolean;
  v_today   date := public.hospital_today();
  v_patient uuid;
  v_preg    uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_role is null or v_role not in ('receptionist', 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'INVALID_INPUT' using detail = 'details must be an object';
  end if;

  v_name  := nullif(btrim(p_details ->> 'full_name'), '');
  v_mrn   := nullif(btrim(p_details ->> 'mrn'), '');
  v_email := nullif(lower(btrim(p_details ->> 'email')), '');
  v_blood := nullif(btrim(p_details ->> 'blood_group'), '');
  if v_name is null then
    raise exception 'INVALID_INPUT' using detail = 'full_name is required';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_INPUT' using detail = 'email is not valid';
  end if;

  begin
    v_consent := coalesce((p_details ->> 'consent')::boolean, false);
    v_lmp    := coalesce((p_details ->> 'lmp_date')::date, (p_details ->> 'edd_date')::date - 280);
    v_dob    := (p_details ->> 'dob')::date;
    v_doctor := (p_details ->> 'primary_doctor')::uuid;
  exception when others then
    raise exception 'INVALID_INPUT' using detail = 'dates and ids must be well formed';
  end;
  if not v_consent then
    raise exception 'CONSENT_REQUIRED';
  end if;
  if v_lmp is null or v_lmp > v_today or v_lmp < v_today - 300 then
    raise exception 'INVALID_INPUT' using detail = 'LMP must be within the last 300 days';
  end if;
  if v_dob is not null and v_dob >= v_today then
    raise exception 'INVALID_INPUT' using detail = 'dob must be in the past';
  end if;
  if v_doctor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_doctor and p.role = 'doctor' and p.is_active and p.deleted_at is null
  ) then
    raise exception 'INVALID_INPUT' using detail = 'primary_doctor must be an active doctor';
  end if;

  perform pg_advisory_xact_lock(hashtext('garbh.mrn'));
  if v_mrn is null then
    v_mrn := private.next_mrn();
  elsif exists (select 1 from public.patients p where p.mrn = v_mrn) then
    raise exception 'MRN_TAKEN';
  end if;

  begin
    insert into public.patients (
      mrn, full_name, dob, phone, email, address, blood_group, rh_negative, allergies, chronic_conditions,
      emergency_contact, registration_source, verified_at, verified_by, consent_ai_at, consent_data_at, created_by
    ) values (
      v_mrn, v_name, v_dob, nullif(btrim(p_details ->> 'phone'), ''), v_email,
      nullif(btrim(p_details ->> 'address'), ''), v_blood,
      case when v_blood like '%-' then true when v_blood like '%+' then false end,
      coalesce(array(select jsonb_array_elements_text(p_details -> 'allergies')), '{}'),
      coalesce(array(select jsonb_array_elements_text(p_details -> 'chronic_conditions')), '{}'),
      nullif(btrim(p_details ->> 'emergency_contact'), ''),
      'desk', now(), auth.uid(), now(), now(), auth.uid()
    ) returning id into v_patient;

    insert into public.pregnancies (patient_id, lmp_date, lmp_source, gravida, para, abortus, living)
    values (
      v_patient, v_lmp, 'clinician',
      (p_details ->> 'gravida')::smallint, (p_details ->> 'para')::smallint,
      (p_details ->> 'abortus')::smallint, (p_details ->> 'living')::smallint
    ) returning id into v_preg;
  exception
    when unique_violation then
      raise exception 'MRN_TAKEN';
    when check_violation or invalid_text_representation or invalid_parameter_value
         or numeric_value_out_of_range or datatype_mismatch then
      raise exception 'INVALID_INPUT' using detail = 'a field value is not valid';
  end;

  insert into public.care_team (pregnancy_id, doctor_id, care_role, added_by)
  values (v_preg, v_doctor, 'primary', auth.uid());

  return v_patient;
end $$;

----------------------------------------------------------------------------
-- mark_visit_contacted: the "Called patient" note on the visits-due worklist
----------------------------------------------------------------------------
create function public.mark_visit_contacted(p_visit uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if public.auth_role() not in ('receptionist', 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'INVALID_INPUT' using detail = 'note is too long';
  end if;
  update public.visits set contacted_at = now(), contact_note = nullif(btrim(p_note), '') where id = p_visit;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end $$;

----------------------------------------------------------------------------
-- Grants (AGENTS.md §4)
----------------------------------------------------------------------------
revoke execute on function public.verify_patient(uuid, text, uuid) from public, anon;
grant execute on function public.verify_patient(uuid, text, uuid) to authenticated;
revoke execute on function public.merge_patients(uuid, uuid) from public, anon;
grant execute on function public.merge_patients(uuid, uuid) to authenticated;
revoke execute on function public.register_patient(jsonb) from public, anon;
grant execute on function public.register_patient(jsonb) to authenticated;
revoke execute on function public.mark_visit_contacted(uuid, text) from public, anon;
grant execute on function public.mark_visit_contacted(uuid, text) to authenticated;
revoke execute on function public.next_mrn() from public, anon;
grant execute on function public.next_mrn() to authenticated;
