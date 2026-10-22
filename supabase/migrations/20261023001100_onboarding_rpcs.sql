-- Onboarding + shared RPCs. Owner: head.
-- Error convention (see src/domain/rpc-errors.ts): RPCs raise an exception whose MESSAGE is
-- an UPPER_SNAKE code, optionally with a DETAIL for developers.

-- Records Terms + Privacy + AI-processing consent for the caller (PLAN.md §7.1, §12).
create function public.record_consent() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.profiles set consent_at = coalesce(consent_at, now()) where id = auth.uid();
  update public.patients
    set consent_data_at = coalesce(consent_data_at, now()),
        consent_ai_at   = coalesce(consent_ai_at, now())
    where user_id = auth.uid();
end $$;

-- PLAN.md §5.3. Sets the caller's role exactly once.
--   p_kind 'companion': role only (p_details.full_name optional).
--   p_kind 'patient'  : role + patients row (app, unverified) + active pregnancy
--                       (lmp_source = patient_reported) -> 12-visit plan via trigger.
--     p_details: { full_name (required), dob, phone, lmp_date | edd_date (one required),
--                  gravida, para, abortus, living, allergies: text[], chronic_conditions: text[] }
create function public.complete_signup(p_kind text, p_details jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_name    text := nullif(btrim(p_details ->> 'full_name'), '');
  v_lmp     date;
  v_today   date := public.hospital_today();
  v_patient uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or not v_profile.is_active or v_profile.deleted_at is not null then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_profile.role is not null then
    raise exception 'ALREADY_ONBOARDED';
  end if;
  if v_profile.consent_at is null then
    raise exception 'CONSENT_REQUIRED';
  end if;

  if p_kind = 'companion' then
    update public.profiles set role = 'companion', full_name = coalesce(v_name, full_name) where id = v_uid;
    return;
  end if;

  if p_kind is distinct from 'patient' then
    raise exception 'INVALID_INPUT' using detail = 'p_kind must be patient or companion';
  end if;

  if v_name is null then
    raise exception 'INVALID_INPUT' using detail = 'full_name is required';
  end if;

  begin
    v_lmp := coalesce((p_details ->> 'lmp_date')::date, (p_details ->> 'edd_date')::date - 280);
  exception when others then
    raise exception 'INVALID_INPUT' using detail = 'lmp_date/edd_date must be YYYY-MM-DD';
  end;
  if v_lmp is null or v_lmp > v_today or v_lmp < v_today - 300 then
    raise exception 'INVALID_INPUT' using detail = 'LMP must be within the last 300 days';
  end if;

  update public.profiles
    set role = 'patient', full_name = v_name, phone = coalesce(nullif(p_details ->> 'phone', ''), phone)
    where id = v_uid;

  insert into public.patients (
    user_id, full_name, dob, phone, email, allergies, chronic_conditions,
    registration_source, consent_ai_at, consent_data_at, created_by
  ) values (
    v_uid, v_name, (p_details ->> 'dob')::date, nullif(p_details ->> 'phone', ''), v_profile.email,
    coalesce(array(select jsonb_array_elements_text(p_details -> 'allergies')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_details -> 'chronic_conditions')), '{}'),
    'app', v_profile.consent_at, v_profile.consent_at, v_uid
  ) returning id into v_patient;

  insert into public.pregnancies (patient_id, lmp_date, lmp_source, gravida, para, abortus, living)
  values (
    v_patient, v_lmp, 'patient_reported',
    (p_details ->> 'gravida')::smallint, (p_details ->> 'para')::smallint,
    (p_details ->> 'abortus')::smallint, (p_details ->> 'living')::smallint
  );
end $$;

-- "Every view is audit-logged" (PLAN.md §0 doctor access, §1 #8). Call when a doctor or admin
-- opens a patient chart / sensitive record. No-op for other roles.
create function public.log_sensitive_view(p_patient uuid, p_table text, p_record text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := public.auth_role();
begin
  if v_role in ('doctor','admin') then
    insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id)
    values (auth.uid(), v_role, 'view_sensitive', p_table, p_record, p_patient);
  end if;
end $$;
