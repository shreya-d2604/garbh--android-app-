-- Service-role-only functions behind the admin-users and export-patient-data Edge Functions
-- (PLAN.md §7.6 #2, #7, §12). Owner: admin agent.
--
-- These are NOT callable by authenticated users: the Edge Function verifies the caller is an admin
-- from the JWT, then calls them with the service role and passes the acting admin as p_actor, which
-- every function re-checks (private.require_active_admin) and uses so the audit triggers attribute
-- the changes to that admin (private.act_as).

----------------------------------------------------------------------------
-- Staff accounts. The auth user (and, for new users, the profile with its role) already exists:
-- the Edge Function creates it with app_metadata.role and the auth trigger builds the profile.
-- p_args keys (all optional): full_name, phone, role, is_active, designation, specialization,
-- registration_no, bio, accepts_new_patients.
-- p_event labels the audit row: staff_create | staff_update | staff_set_role | staff_set_active.
----------------------------------------------------------------------------
create function public.admin_staff_apply(p_actor uuid, p_user uuid, p_args jsonb, p_event text default 'staff_update')
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

----------------------------------------------------------------------------
-- Account deletion (DPDP / Play Store). De-identify + remove app access; clinical records stay
-- (retention duty, PLAN.md §12). The Edge Function then bans and scrubs the auth user.
----------------------------------------------------------------------------
create function public.admin_deidentify_user(p_actor uuid, p_user uuid, p_request uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles%rowtype;
  v_patient public.patients%rowtype;
  v_cancelled uuid[];
begin
  perform private.require_active_admin(p_actor);
  select * into v_profile from public.profiles where id = p_user for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_user = p_actor then
    raise exception 'INVALID_INPUT' using detail = 'an admin cannot delete their own account here';
  end if;
  if v_profile.role = 'admin' and v_profile.is_active and private.active_admin_count() <= 1 then
    raise exception 'INVALID_INPUT' using detail = 'cannot delete the last active admin';
  end if;
  if p_request is not null and not exists (
    select 1 from public.data_requests r
    where r.id = p_request and r.user_id = p_user and r.kind = 'deletion' and r.status in ('open', 'in_progress')
  ) then
    raise exception 'INVALID_STATUS_CHANGE' using detail = 'no open deletion request for this user';
  end if;

  perform private.act_as(p_actor);

  select * into v_patient from public.patients where user_id = p_user;

  update public.profiles
    set full_name = 'Deleted user', email = null, phone = null, avatar_path = null,
        is_active = false, deleted_at = coalesce(deleted_at, now())
    where id = p_user;

  if v_patient.id is not null then
    -- Keep the clinical record and the hospital number (retention); drop everything that identifies her.
    update public.patients
      set full_name = 'Deleted patient', dob = null, phone = null, email = null, address = null,
          emergency_contact = null, user_id = null, deleted_at = coalesce(deleted_at, now())
      where id = v_patient.id;

    update public.companion_links set status = 'revoked', decided_at = now()
      where patient_id = v_patient.id and status in ('pending', 'approved');
    update public.companion_invites set revoked_at = now()
      where patient_id = v_patient.id and revoked_at is null and used_at is null;

    with c as (
      update public.appointments
        set status = 'cancelled', cancelled_by = p_actor, cancelled_reason = 'Account deleted at the patient''s request'
        where patient_id = v_patient.id and status in ('booked', 'confirmed') and starts_at > now()
        returning id
    )
    select coalesce(array_agg(id), '{}') into v_cancelled from c;
    update public.visits set status = 'planned', appointment_id = null
      where appointment_id = any(v_cancelled) and status = 'scheduled';
  end if;

  update public.companion_links set status = 'left', decided_at = now()
    where companion_user_id = p_user and status in ('pending', 'approved');
  delete from public.notifications where user_id = p_user;
  delete from public.push_tokens where user_id = p_user;

  if p_request is not null then
    update public.data_requests
      set status = 'done', resolved_by = p_actor, resolved_at = now(),
          note = coalesce(note, 'Account de-identified; clinical records retained as required by law')
      where id = p_request;
  end if;

  perform private.audit_admin(
    'update', 'profiles', p_user::text, v_patient.id, null,
    jsonb_build_object('event', 'deidentify_account', 'request', p_request));
end $$;

----------------------------------------------------------------------------
-- DPDP data export for one patient (PLAN.md §7.6 #7). Give exactly one of p_patient / p_user.
-- A companion or staff member has no patient row: the export then holds profile, links, notifications.
-- Writes the audit row action = 'export'.
----------------------------------------------------------------------------
create function public.admin_export_patient_data(p_actor uuid, p_patient uuid default null, p_user uuid default null)
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

  v_out := jsonb_build_object(
    'format_version', 1,
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_user),
    'patient', case when v_patient.id is null then null else to_jsonb(v_patient) end,
    'pregnancies', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.pregnancies x where x.patient_id = v_patient.id), '[]'),
    'care_team', coalesce((select jsonb_agg(to_jsonb(x) order by x.added_at) from public.care_team x where x.pregnancy_id = any (v_preg)), '[]'),
    'visits', coalesce((select jsonb_agg(to_jsonb(x) order by x.seq) from public.visits x where x.pregnancy_id = any (v_preg)), '[]'),
    'appointments', coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from public.appointments x where x.patient_id = v_patient.id), '[]'),
    'consultations', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.consultations x where x.pregnancy_id = any (v_preg)), '[]'),
    'consultation_private_notes', coalesce((select jsonb_agg(to_jsonb(x)) from public.consultation_private_notes x where x.pregnancy_id = any (v_preg)), '[]'),
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
    -- who touched this record: metadata only (no old/new values)
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

-- Service role only: authenticated users (including admins) must go through the Edge Functions.
revoke execute on function public.admin_staff_apply(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_staff_apply(uuid, uuid, jsonb, text) to service_role;
revoke execute on function public.admin_deidentify_user(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_deidentify_user(uuid, uuid, uuid) to service_role;
revoke execute on function public.admin_export_patient_data(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_export_patient_data(uuid, uuid, uuid) to service_role;
