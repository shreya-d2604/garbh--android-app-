-- Foundation triggers: auth -> profiles, role/column guards, updated_at, care-team check,
-- visit plan generation, audit. Owner: head.

----------------------------------------------------------------------------
-- updated_at
----------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger set_updated_at before update on public.patients     for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.pregnancies  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.visits       for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.appointments for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.consultations for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.consultation_private_notes for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.hospital_settings for each row execute function private.set_updated_at();

----------------------------------------------------------------------------
-- auth.users -> profiles
--   * Staff (admin-users Edge Function) and other service-role-created users carry
--     raw_app_meta_data.role. app_metadata is NOT user-writable; raw_user_meta_data is
--     never trusted for the role.
--   * A user whose email matches a verified desk-registered patient with no account is
--     linked to that patient and becomes role 'patient' (this is the "app invite" path:
--     the patient simply signs in with the email given at the desk; OTP proves ownership).
--   * Everyone else starts with role = null and goes through complete_signup().
----------------------------------------------------------------------------
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_role    public.user_role;
  v_patient public.patients%rowtype;
begin
  begin
    v_role := nullif(new.raw_app_meta_data ->> 'role', '')::public.user_role;
  exception when invalid_text_representation then
    v_role := null;
  end;

  insert into public.profiles (id, role, email, phone, full_name)
  values (new.id, v_role, new.email, new.phone, nullif(new.raw_user_meta_data ->> 'full_name', ''));

  if v_role is null and new.email is not null then
    select * into v_patient from public.patients pt
    where lower(pt.email) = lower(new.email)
      and pt.user_id is null and pt.registration_source = 'desk'
      and pt.verified_at is not null and pt.deleted_at is null
    order by pt.created_at
    limit 1;

    if found then
      update public.patients set user_id = new.id where id = v_patient.id;
      update public.profiles
        set role = 'patient', full_name = coalesce(full_name, v_patient.full_name), phone = coalesce(phone, v_patient.phone)
        where id = new.id;
    end if;
  end if;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

----------------------------------------------------------------------------
-- profiles: role / is_active / deleted_at are not user-updatable (PLAN.md §6).
-- Column privileges (see RLS migration) already block direct writes; this trigger is the
-- second line of defence. SECURITY DEFINER RPCs (current_user = postgres) and the
-- service role (Edge Functions) are allowed.
----------------------------------------------------------------------------
create function private.guard_profile_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.deleted_at is distinct from old.deleted_at
      or new.id is distinct from old.id)
     and current_user in ('authenticated', 'anon')
     and public.auth_role() is distinct from 'admin' then
    raise exception 'NOT_ALLOWED' using detail = 'profile role/status can only be changed by an admin';
  end if;
  return new;
end $$;

create trigger guard_profile_update before update on public.profiles
  for each row execute function private.guard_profile_update();

----------------------------------------------------------------------------
-- patients: a patient may update only phone, email, address, emergency_contact on her own row.
----------------------------------------------------------------------------
create function private.guard_patient_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  -- is_verified is generated (null in NEW inside a BEFORE trigger), so it is excluded too.
  v_allowed text[] := array['phone','email','address','emergency_contact','updated_at','is_verified'];
begin
  if current_user in ('authenticated', 'anon') and public.auth_role() = 'patient'
     and (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'NOT_ALLOWED' using detail = 'patients may only edit contact fields';
  end if;
  return new;
end $$;

create trigger guard_patient_update before update on public.patients
  for each row execute function private.guard_patient_update();

----------------------------------------------------------------------------
-- appointments: doctor must be on the pregnancy's active care team, and the pregnancy must
-- belong to the patient (PLAN.md §5.2). The first-visit exception is handled by
-- book_appointment(), which adds the doctor as primary BEFORE inserting the appointment.
----------------------------------------------------------------------------
create function private.check_appointment_care_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pregnancies pr where pr.id = new.pregnancy_id and pr.patient_id = new.patient_id) then
    raise exception 'INVALID_INPUT' using detail = 'pregnancy does not belong to patient';
  end if;
  if not exists (
    select 1 from public.care_team ct
    where ct.pregnancy_id = new.pregnancy_id and ct.doctor_id = new.doctor_id and ct.removed_at is null
  ) then
    raise exception 'NOT_ON_CARE_TEAM';
  end if;
  return new;
end $$;

create trigger check_appointment_care_team
  before insert or update of doctor_id, pregnancy_id, patient_id on public.appointments
  for each row execute function private.check_appointment_care_team();

----------------------------------------------------------------------------
-- Visit plan (PLAN.md §5.3 generate_visit_plan, §10 regeneration rules)
----------------------------------------------------------------------------
-- Inserts one visit per active 'standard' template, unless the pregnancy already has a
-- template-generated plan or has no EDD yet. Idempotent.
create function public.generate_visit_plan(p_pregnancy uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_start date;   -- day 0 of pregnancy = edd_final - 280
begin
  select pr.edd_final - 280 into v_start from public.pregnancies pr where pr.id = p_pregnancy;
  if v_start is null then
    return;
  end if;
  if exists (select 1 from public.visits v where v.pregnancy_id = p_pregnancy and not v.is_extra) then
    return;
  end if;

  insert into public.visits (pregnancy_id, seq, target_week, due_from, due_to, title, purpose, recommended_tests)
  select p_pregnancy, t.seq, t.target_week,
         v_start + t.window_start_week * 7,
         v_start + t.window_end_week * 7 + 6,
         t.title, t.purpose, t.recommended_tests
  from public.visit_templates t
  where t.schedule = 'standard' and t.is_active
  order by t.seq;
end $$;

-- After insert: generate. After the EDD moves: shift only still-'planned' visits by the same
-- number of days (completed/booked visits stay as they are).
create function private.pregnancy_visit_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.generate_visit_plan(new.id);
  elsif new.edd_final is distinct from old.edd_final then
    if old.edd_final is null then
      perform public.generate_visit_plan(new.id);
    elsif new.edd_final is not null then
      update public.visits
        set due_from = due_from + (new.edd_final - old.edd_final),
            due_to   = due_to   + (new.edd_final - old.edd_final)
        where pregnancy_id = new.id and status = 'planned';
    end if;
  end if;
  return null;
end $$;

create trigger pregnancy_visit_plan
  after insert or update of lmp_date, edd_usg on public.pregnancies
  for each row execute function private.pregnancy_visit_plan();

----------------------------------------------------------------------------
-- Audit (PLAN.md §5.2 audit_log). Generic AFTER trigger for clinical tables.
-- Domain agents attach it to any new clinical table with:
--   create trigger audit after insert or update or delete on public.<t>
--     for each row execute function private.audit_row();
----------------------------------------------------------------------------
create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row     jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_patient uuid;
begin
  if tg_table_name = 'patients' then
    v_patient := (v_row ->> 'id')::uuid;
  elsif v_row ? 'patient_id' then
    v_patient := (v_row ->> 'patient_id')::uuid;
  elsif v_row ? 'pregnancy_id' then
    select pr.patient_id into v_patient from public.pregnancies pr where pr.id = (v_row ->> 'pregnancy_id')::uuid;
  elsif v_row ? 'report_id' then
    select pr.patient_id into v_patient
    from public.reports r join public.pregnancies pr on pr.id = r.pregnancy_id
    where r.id = (v_row ->> 'report_id')::uuid;
  end if;

  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, patient_id, old, new)
  values (
    auth.uid(),
    (select p.role from public.profiles p where p.id = auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'consultation_id', v_row ->> 'profile_id'),
    v_patient,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','staff_details','patients','pregnancies','care_team','visits','appointments',
    'consultations','consultation_private_notes','prescription_items',
    'reports','report_files','lab_results','ai_summaries','companion_links'
  ] loop
    execute format(
      'create trigger audit after insert or update or delete on public.%I
         for each row execute function private.audit_row()', t);
  end loop;
end $$;
