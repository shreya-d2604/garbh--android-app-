-- Service-role-only functions behind the admin-users / export-patient-data Edge Functions:
-- nobody but the service role can call them, and they re-check the acting admin (PLAN.md §7.6, §12).
begin;
\ir helpers/setup.psql
select plan(58);

create temp table u as select
  tests.create_user('admin@s.test', 'admin')        as admin,
  tests.create_user('admin2@s.test', 'admin')       as admin2,
  tests.create_user('doc@s.test', 'doctor')         as doc,
  tests.create_user('desk@s.test', 'receptionist')  as desk,
  tests.create_user('newdoc@s.test', 'doctor')      as newdoc,
  tests.create_user('pat@s.test', 'patient')        as pat,
  tests.create_user('comp@s.test', 'companion')     as comp,
  tests.create_user('fresh@s.test')                 as fresh,
  tests.create_user('stale@s.test')                 as stale;
create temp table fx as select tests.create_pregnancy((select pat from u), (select doc from u), 20) as preg;
create temp table ids as select (select patient_id from public.pregnancies where id = (select preg from fx)) as patient;
grant select on u, fx, ids to public;

-- a published consultation + a private note, a future appointment, a notification, a companion link
insert into public.consultations (id, pregnancy_id, doctor_id, advice, published_at)
  values ('c1000000-0000-4000-8000-000000000001', (select preg from fx), (select doc from u), 'advice', now());
insert into public.consultation_private_notes (consultation_id, pregnancy_id, note)
  values ('c1000000-0000-4000-8000-000000000001', (select preg from fx), 'private');
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, status, booking_channel)
  values ('a1000000-0000-4000-8000-000000000001', (select patient from ids), (select preg from fx), (select doc from u),
          now() + interval '3 days', now() + interval '3 days 15 minutes', 'booked', 'app');
insert into public.notifications (user_id, type, title, body) values ((select pat from u), 'appointment_booked', 'Booked', 'Secret body');
insert into public.companion_links (patient_id, companion_user_id, relation, status, can_view_appointments)
  values ((select patient from ids), (select comp from u), 'husband', 'approved', true);
insert into public.data_requests (id, user_id, kind) values
  ('d1000000-0000-4000-8000-000000000001', (select pat from u), 'deletion');

-- ---------------------------------------------------------------- nobody but the service role
select tests.login_as((select admin from u));
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{}') $$, (select admin from u), (select doc from u)), '42501', null, 'an authenticated admin cannot call admin_staff_apply directly');
select throws_ok(format($$ select public.admin_deidentify_user(%L, %L) $$, (select admin from u), (select pat from u)), '42501', null, 'an authenticated admin cannot call admin_deidentify_user directly');
select throws_ok(format($$ select public.admin_export_patient_data(%L, %L) $$, (select admin from u), (select patient from ids)), '42501', null, 'an authenticated admin cannot call admin_export_patient_data directly');
select tests.login_as((select doc from u));
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{}') $$, (select admin from u), (select doc from u)), '42501', null, 'a doctor cannot call admin_staff_apply');
select tests.logout();
select set_config('role', 'anon', true);
select throws_ok(format($$ select public.admin_export_patient_data(%L, %L) $$, (select admin from u), (select patient from ids)), '42501', null, 'anon cannot call admin_export_patient_data');
select set_config('role', 'service_role', true);
select lives_ok(format($$ select public.admin_staff_apply(%L, %L, '{}') $$, (select admin from u), (select doc from u)), 'the service role can call admin_staff_apply');

-- ---------------------------------------------------------------- admin_staff_apply (as service role)
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{}') $$, (select doc from u), (select desk from u)), 'NOT_ALLOWED', 'actor must be an admin');
select throws_ok(format($$ select public.admin_staff_apply(NULL, %L, '{}') $$, (select desk from u)), 'NOT_ALLOWED', 'actor is required');
select throws_ok(format($$ select public.admin_staff_apply(%L, gen_random_uuid(), '{}') $$, (select admin from u)), 'NOT_FOUND', 'unknown user');
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{"full_name":"X"}') $$, (select admin from u), (select pat from u)), 'INVALID_INPUT', 'patients are not managed here');
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{}', 'bogus') $$, (select admin from u), (select doc from u)), 'INVALID_INPUT', 'unknown audit event');

-- GoTrue writes app_metadata after the INSERT the auth trigger sees, so a just-created account has no role yet
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{"full_name":"Fresh"}', 'staff_update') $$, (select admin from u), (select fresh from u)), 'INVALID_INPUT', 'a role-less account cannot be edited as staff');
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{"full_name":"Fresh"}', 'staff_create') $$, (select admin from u), (select fresh from u)), 'INVALID_INPUT', 'a new account needs a role');
select lives_ok(format($$ select public.admin_staff_apply(%L, %L, '{"role":"receptionist","full_name":"Fresh Desk"}', 'staff_create') $$, (select admin from u), (select fresh from u)), 'staff_create sets the role of a brand-new account');
select is((select role::text from public.profiles where id = (select fresh from u)), 'receptionist', 'the new account is a receptionist');
select set_config('role', 'postgres', true);
update public.profiles set created_at = now() - interval '1 hour' where id = (select stale from u);
select set_config('role', 'service_role', true);
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{"role":"doctor"}', 'staff_create') $$, (select admin from u), (select stale from u)), 'INVALID_INPUT', 'an old role-less account cannot be turned into staff');

select lives_ok(format($$ select public.admin_staff_apply(%L, %L,
  '{"full_name":"Dr. New Doctor","phone":"+919811111111","designation":"Consultant","specialization":"Obstetrics","registration_no":"MMC-1","bio":"Hello"}', 'staff_create') $$,
  (select admin from u), (select newdoc from u)), 'staff_create fills profile and staff_details');
select results_eq(
  format($$ select p.full_name, p.phone, s.designation, s.specialization, s.registration_no, s.bio from public.profiles p
            join public.staff_details s on s.profile_id = p.id where p.id = %L $$, (select newdoc from u)),
  $$ values ('Dr. New Doctor'::text, '+919811111111'::text, 'Consultant'::text, 'Obstetrics'::text, 'MMC-1'::text, 'Hello'::text) $$, 'new staff data stored');
select lives_ok(format($$ select public.admin_staff_apply(%L, %L, '{"designation":"Senior Consultant"}') $$, (select admin from u), (select newdoc from u)), 'a partial update succeeds');
select results_eq(
  format($$ select s.designation, s.specialization from public.staff_details s where s.profile_id = %L $$, (select newdoc from u)),
  $$ values ('Senior Consultant'::text, 'Obstetrics'::text) $$, 'only the given field changed');
select is((select count(*)::int from public.audit_log where table_name = 'profiles' and record_id = (select newdoc from u)::text
           and actor_id = (select admin from u) and new ->> 'event' = 'staff_create'), 1, 'the create event is audit-logged for the admin');
select is((select new -> 'fields' from public.audit_log where new ->> 'event' = 'staff_create' and record_id = (select newdoc from u)::text),
  '["bio", "designation", "full_name", "phone", "registration_no", "specialization"]'::jsonb, 'the audit row lists field names, not values');
select ok((select count(*) from public.audit_log where table_name = 'staff_details' and record_id = (select newdoc from u)::text and actor_id = (select admin from u)) >= 1,
  'row-level audit entries are attributed to the admin, not to the service role');

select lives_ok(format($$ select public.admin_staff_apply(%L, %L, '{"role":"receptionist"}', 'staff_set_role') $$, (select admin from u), (select newdoc from u)), 'role change');
select is((select role::text from public.profiles where id = (select newdoc from u)), 'receptionist', 'role is now receptionist');
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{"role":"patient"}', 'staff_set_role') $$, (select admin from u), (select newdoc from u)), 'INVALID_INPUT', 'a staff member cannot become a patient');
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{"role":"nonsense"}', 'staff_set_role') $$, (select admin from u), (select newdoc from u)), 'INVALID_INPUT', 'unknown role');
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{"role":"doctor"}', 'staff_set_role') $$, (select admin from u), (select admin from u)), 'INVALID_INPUT', 'an admin cannot change her own role');

select lives_ok(format($$ select public.admin_staff_apply(%L, %L, '{"is_active":false}', 'staff_set_active') $$, (select admin from u), (select newdoc from u)), 'deactivate');
select is((select is_active from public.profiles where id = (select newdoc from u)), false, 'profile is inactive');
select lives_ok(format($$ select public.admin_staff_apply(%L, %L, '{"is_active":true}', 'staff_set_active') $$, (select admin from u), (select newdoc from u)), 'reactivate');
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{"is_active":false}', 'staff_set_active') $$, (select admin from u), (select admin from u)), 'INVALID_INPUT', 'an admin cannot deactivate herself');

-- a deactivated admin can no longer act; with two active admins one can be demoted
select set_config('role', 'postgres', true);
update public.profiles set is_active = false where role = 'admin' and id <> (select admin from u);
select set_config('role', 'service_role', true);
select throws_ok(format($$ select public.admin_staff_apply(%L, %L, '{}') $$, (select admin2 from u), (select desk from u)), 'NOT_ALLOWED', 'a deactivated admin can no longer act');
select set_config('role', 'postgres', true);
update public.profiles set is_active = true where id = (select admin2 from u);
select set_config('role', 'service_role', true);
select lives_ok(format($$ select public.admin_staff_apply(%L, %L, '{"role":"doctor"}', 'staff_set_role') $$, (select admin from u), (select admin2 from u)), 'with two admins one can be demoted');

-- ---------------------------------------------------------------- admin_deidentify_user
select throws_ok(format($$ select public.admin_deidentify_user(%L, %L) $$, (select doc from u), (select pat from u)), 'NOT_ALLOWED', 'deidentify: actor must be an admin');
select throws_ok(format($$ select public.admin_deidentify_user(%L, %L) $$, (select admin from u), (select admin from u)), 'INVALID_INPUT', 'deidentify: not yourself');
select throws_ok(format($$ select public.admin_deidentify_user(%L, %L, gen_random_uuid()) $$, (select admin from u), (select pat from u)), 'INVALID_STATUS_CHANGE', 'deidentify: the request must exist for this user');
select lives_ok(format($$ select public.admin_deidentify_user(%L, %L, 'd1000000-0000-4000-8000-000000000001') $$, (select admin from u), (select pat from u)), 'deidentify a patient account');
select results_eq(
  format($$ select full_name, email, phone, is_active, deleted_at is not null from public.profiles where id = %L $$, (select pat from u)),
  $$ values ('Deleted user'::text, null::text, null::text, false, true) $$, 'profile is de-identified and deactivated');
select results_eq(
  format($$ select full_name, dob, phone, email, user_id, mrn is not null, deleted_at is not null from public.patients where id = %L $$, (select patient from ids)),
  $$ values ('Deleted patient'::text, null::date, null::text, null::text, null::uuid, true, true) $$, 'patient row is de-identified, the hospital number is kept');
select is((select count(*)::int from public.pregnancies where id = (select preg from fx)), 1, 'the clinical record is retained (pregnancy)');
select is((select count(*)::int from public.consultations where id = 'c1000000-0000-4000-8000-000000000001'), 1, 'the clinical record is retained (consultation)');
select is((select status::text from public.appointments where id = 'a1000000-0000-4000-8000-000000000001'), 'cancelled', 'her future appointment is cancelled');
select is((select count(*)::int from public.notifications where user_id = (select pat from u)), 0, 'her notifications are deleted');
select is((select status::text from public.companion_links where patient_id = (select patient from ids)), 'revoked', 'companion access is revoked');
select results_eq(
  $$ select status, resolved_by = (select admin from u), resolved_at is not null from public.data_requests where id = 'd1000000-0000-4000-8000-000000000001' $$,
  $$ values ('done'::text, true, true) $$, 'the deletion request is closed by the admin');
select is((select count(*)::int from public.audit_log where new ->> 'event' = 'deidentify_account' and actor_id = (select admin from u) and record_id = (select pat from u)::text), 1, 'de-identification is audit-logged');

-- ---------------------------------------------------------------- admin_export_patient_data
select throws_ok(format($$ select public.admin_export_patient_data(%L, %L) $$, (select doc from u), (select patient from ids)), 'NOT_ALLOWED', 'export: actor must be an admin');
select throws_ok(format($$ select public.admin_export_patient_data(%L) $$, (select admin from u)), 'INVALID_INPUT', 'export: needs a patient or a user');
select throws_ok(format($$ select public.admin_export_patient_data(%L, %L, %L) $$, (select admin from u), (select patient from ids), (select pat from u)), 'INVALID_INPUT', 'export: not both');
select throws_ok(format($$ select public.admin_export_patient_data(%L, gen_random_uuid()) $$, (select admin from u)), 'NOT_FOUND', 'export: unknown patient');
create temp table ex as select public.admin_export_patient_data((select admin from u), (select patient from ids)) as j;
grant select on ex to public;
select is((select j -> 'patient' ->> 'full_name' from ex), 'Deleted patient', 'export: the patient row');
select is((select jsonb_array_length(j -> 'pregnancies') from ex), 1, 'export: pregnancies');
select is((select jsonb_array_length(j -> 'consultations') from ex), 1, 'export: consultations');
select is((select jsonb_array_length(j -> 'consultation_private_notes') from ex), 1, 'export: includes the doctor''s private notes');
select ok((select j ? 'access_log' from ex), 'export: includes who accessed the record');
select is((select count(*)::int from public.audit_log where action = 'export' and actor_id = (select admin from u) and patient_id = (select patient from ids)), 1, 'export is audit-logged (action = export)');
select is((select j -> 'patient' from public.admin_export_patient_data((select admin from u), null, (select comp from u)) as t(j)), 'null'::jsonb, 'export by user id of a companion: no patient row');

select * from finish();
rollback;
