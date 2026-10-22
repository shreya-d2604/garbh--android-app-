-- Row-Level Security foundation (PLAN.md §4, §6). Owner: head.
--
-- Split of responsibility (see AGENTS.md):
--   * head (this file): RLS ENABLED on every table (default deny), `admin_all` on every table,
--     ALL read (SELECT) policies from the §4 matrix, and identity/self-service writes.
--   * domain agents: every other INSERT/UPDATE/DELETE policy and the domain RPCs, in their own
--     migration range. Patients/companions never get direct write policies on appointments,
--     care_team or companion tables: those go through SECURITY DEFINER RPCs.
-- Policy naming: <table>_<who>_<op>, e.g. consultations_doctor_insert.

-- ---------------------------------------------------------------- enable RLS everywhere
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------- admin: full access
-- PLAN.md §1 #8 / §4: admin has RWD on everything, except the append-only audit log and the
-- rate-limit table (read only).
do $$
declare t record;
begin
  for t in select tablename from pg_tables
           where schemaname = 'public' and tablename not in ('audit_log','code_redeem_attempts') loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.auth_role() = ''admin'') with check (public.auth_role() = ''admin'')',
      t.tablename || '_admin_all', t.tablename);
  end loop;
end $$;
create policy audit_log_admin_select on public.audit_log for select to authenticated
  using (public.auth_role() = 'admin');
create policy code_redeem_attempts_admin_select on public.code_redeem_attempts for select to authenticated
  using (public.auth_role() = 'admin');

-- ---------------------------------------------------------------- identity
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_staff_select on public.profiles for select to authenticated
  using (public.is_staff());
-- A patient can see the profile (name) of companions who requested / follow her.
create policy profiles_patient_companion_select on public.profiles for select to authenticated
  using (exists (
    select 1 from public.companion_links l
    where l.companion_user_id = profiles.id and l.patient_id = public.my_patient_id()
      and l.status in ('pending','approved')));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Column privileges: users may only edit these profile columns directly.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;

create policy staff_details_staff_select on public.staff_details for select to authenticated
  using (public.is_staff());
create policy staff_details_doctor_update on public.staff_details for update to authenticated
  using (profile_id = auth.uid() and public.auth_role() = 'doctor')
  with check (profile_id = auth.uid() and public.auth_role() = 'doctor');

create policy hospital_settings_select on public.hospital_settings for select to authenticated
  using (true);

create policy data_requests_self_select on public.data_requests for select to authenticated
  using (user_id = auth.uid());
create policy data_requests_self_insert on public.data_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'open' and resolved_by is null);

-- ---------------------------------------------------------------- patients & pregnancy
create policy patients_reception_select on public.patients for select to authenticated
  using (public.auth_role() = 'receptionist');
create policy patients_doctor_select on public.patients for select to authenticated
  using (public.on_patient_care_team(id));
create policy patients_self_select on public.patients for select to authenticated
  using (user_id = auth.uid());
create policy patients_companion_select on public.patients for select to authenticated
  using (public.companion_can(id, 'any'));
-- Contact fields only; enforced by trigger private.guard_patient_update.
create policy patients_self_update on public.patients for update to authenticated
  using (user_id = auth.uid() and public.auth_role() = 'patient')
  with check (user_id = auth.uid());

create policy pregnancies_reception_select on public.pregnancies for select to authenticated
  using (public.auth_role() = 'receptionist');
create policy pregnancies_viewer_select on public.pregnancies for select to authenticated
  using (public.can_view_pregnancy(id, 'journey'));

create policy care_team_reception_select on public.care_team for select to authenticated
  using (public.auth_role() = 'receptionist');
create policy care_team_viewer_select on public.care_team for select to authenticated
  using (public.can_view_pregnancy(pregnancy_id, 'appointments'));

create policy visits_reception_select on public.visits for select to authenticated
  using (public.auth_role() = 'receptionist');
create policy visits_viewer_select on public.visits for select to authenticated
  using (public.can_view_pregnancy(pregnancy_id, 'journey'));

-- ---------------------------------------------------------------- catalogs (any onboarded user)
create policy visit_templates_select  on public.visit_templates  for select to authenticated using (public.auth_role() is not null);
create policy week_content_select     on public.week_content     for select to authenticated using (public.auth_role() is not null);
create policy milestones_select       on public.milestones       for select to authenticated using (public.auth_role() is not null);
create policy lab_tests_select        on public.lab_tests        for select to authenticated using (public.auth_role() is not null);
create policy drug_catalog_select     on public.drug_catalog     for select to authenticated using (public.auth_role() is not null);
create policy curated_guidance_select on public.curated_guidance for select to authenticated using (public.auth_role() is not null);

-- ---------------------------------------------------------------- availability (staff read; doctor manages own)
create policy doctor_availability_staff_select on public.doctor_availability for select to authenticated
  using (public.is_staff());
create policy doctor_availability_doctor_write on public.doctor_availability for all to authenticated
  using (doctor_id = auth.uid() and public.auth_role() = 'doctor')
  with check (doctor_id = auth.uid() and public.auth_role() = 'doctor');
create policy doctor_time_off_staff_select on public.doctor_time_off for select to authenticated
  using (public.is_staff());
create policy doctor_time_off_doctor_write on public.doctor_time_off for all to authenticated
  using (doctor_id = auth.uid() and public.auth_role() = 'doctor')
  with check (doctor_id = auth.uid() and public.auth_role() = 'doctor');

-- ---------------------------------------------------------------- appointments (writes: RPC only)
create policy appointments_reception_select on public.appointments for select to authenticated
  using (public.auth_role() = 'receptionist');
create policy appointments_doctor_own_select on public.appointments for select to authenticated
  using (doctor_id = auth.uid() and public.auth_role() = 'doctor');
create policy appointments_viewer_select on public.appointments for select to authenticated
  using (public.can_view_pregnancy(pregnancy_id, 'appointments'));

-- ---------------------------------------------------------------- clinical (no receptionist policy at all)
create policy consultations_doctor_select on public.consultations for select to authenticated
  using (public.on_care_team(pregnancy_id));
create policy consultations_published_select on public.consultations for select to authenticated
  using (published_at is not null and public.can_view_pregnancy(pregnancy_id, 'summaries'));

create policy consultation_private_notes_doctor_select on public.consultation_private_notes for select to authenticated
  using (public.on_care_team(pregnancy_id));

create policy prescription_items_doctor_select on public.prescription_items for select to authenticated
  using (public.on_care_team(pregnancy_id));
create policy prescription_items_published_select on public.prescription_items for select to authenticated
  using (
    public.can_view_pregnancy(pregnancy_id, 'prescriptions')
    and exists (select 1 from public.consultations c where c.id = consultation_id and c.published_at is not null));

create policy reports_doctor_select on public.reports for select to authenticated
  using (public.on_care_team(pregnancy_id));
create policy reports_viewer_select on public.reports for select to authenticated
  using (deleted_at is null and public.can_view_pregnancy(pregnancy_id, 'reports'));

-- Inherits the caller's visibility of the parent report.
create policy report_files_select on public.report_files for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id));

create policy lab_results_doctor_select on public.lab_results for select to authenticated
  using (public.on_care_team(pregnancy_id));
create policy lab_results_verified_select on public.lab_results for select to authenticated
  using (verified and public.can_view_pregnancy(pregnancy_id, 'reports'));

-- Patients/companions NEVER read ai_summaries directly; they use the published_summaries view.
create policy ai_summaries_doctor_select on public.ai_summaries for select to authenticated
  using (public.on_care_team(pregnancy_id));

-- ---------------------------------------------------------------- companions (writes: RPC only)
create policy companion_invites_patient_select on public.companion_invites for select to authenticated
  using (patient_id = public.my_patient_id());

create policy companion_links_patient_select on public.companion_links for select to authenticated
  using (patient_id = public.my_patient_id());
create policy companion_links_companion_select on public.companion_links for select to authenticated
  using (companion_user_id = auth.uid());
create policy companion_links_doctor_select on public.companion_links for select to authenticated
  using (public.on_patient_care_team(patient_id));

-- ---------------------------------------------------------------- notifications
create policy notifications_self_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy push_tokens_self_select on public.push_tokens for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------- privileges hardening
-- anon never touches app data; audit_log is append-only via SECURITY DEFINER code.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
