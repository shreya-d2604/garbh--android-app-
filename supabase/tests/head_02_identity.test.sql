-- PLAN.md Phase 1 exit: a user cannot change their role, cannot call complete_signup twice,
-- and cannot pick a staff role. Plus auth trigger, consent, desk-patient linking, column guards.
begin;
\ir helpers/setup.psql
select plan(24);

create temp table u as select
  tests.create_user('self@x.test')             as self_user,
  tests.create_user('doc@x.test', 'doctor')    as doctor,
  tests.create_user('desk@x.test', 'receptionist') as desk,
  tests.create_user('admin@x.test', 'admin')   as admin,
  tests.create_user('mum@x.test')              as mum,
  tests.create_user('hack@x.test', 'superuser') as bad_role;
grant select on u to authenticated;

select is((select role from public.profiles where id = (select self_user from u)), null, 'self-signup starts with role null');
select is((select role::text from public.profiles where id = (select doctor from u)), 'doctor', 'app_metadata.role sets staff role');
select is((select role from public.profiles where id = (select bad_role from u)), null, 'unknown app_metadata role is ignored');

-- ---- self-signup user
select tests.login_as((select self_user from u));
select is(public.auth_role(), null, 'auth_role() is null before onboarding');
select throws_ok($$ select public.complete_signup('companion', '{}') $$, 'CONSENT_REQUIRED', 'consent required first');
select lives_ok($$ select public.record_consent() $$, 'record_consent');
select throws_ok($$ update public.profiles set role = 'admin' where id = auth.uid() $$, '42501', null, 'cannot update own role (column privilege)');
select throws_ok($$ update public.profiles set is_active = false where id = auth.uid() $$, '42501', null, 'cannot update own is_active');
select lives_ok($$ update public.profiles set full_name = 'Rahul' where id = auth.uid() $$, 'can update own name');
select throws_ok($$ select public.complete_signup('doctor', '{}') $$, 'INVALID_INPUT', 'cannot pick a staff role');
select throws_ok($$ select public.complete_signup('admin', '{}') $$, 'INVALID_INPUT', 'cannot pick admin');
select lives_ok($$ select public.complete_signup('companion', '{"full_name":"Rahul K"}') $$, 'complete_signup companion');
select is(public.auth_role()::text, 'companion', 'role is now companion');
select throws_ok($$ select public.complete_signup('patient', '{"full_name":"X","lmp_date":"2026-09-01"}') $$, 'ALREADY_ONBOARDED', 'complete_signup twice fails');

-- ---- patient self-registration
select tests.login_as((select mum from u));
select public.record_consent();
select throws_ok($$ select public.complete_signup('patient', '{"full_name":"Mum"}') $$, 'INVALID_INPUT', 'patient needs LMP or EDD');
select lives_ok(
  format($$ select public.complete_signup('patient', '{"full_name":"Mum","phone":"+91999","lmp_date":"%s","allergies":["Latex"]}') $$,
         public.hospital_today() - 60),
  'complete_signup patient');
select results_eq(
  $$ select registration_source, mrn, is_verified, allergies, consent_ai_at is not null from public.patients where user_id = auth.uid() $$,
  $$ values ('app'::text, null::text, false, array['Latex'], true) $$,
  'unverified app patient row created with consent');
select results_eq(
  $$ select pr.lmp_source, pr.status::text, (select count(*)::int from public.visits v where v.pregnancy_id = pr.id) > 0
     from public.pregnancies pr where pr.patient_id = public.my_patient_id() $$,
  $$ values ('patient_reported'::text, 'active'::text, true) $$,
  'active pregnancy with visit plan, visible to the patient');
select lives_ok($$ update public.patients set phone = '+91888' where user_id = auth.uid() $$, 'patient can edit contact fields');
select throws_ok($$ update public.patients set mrn = 'FAKE' where user_id = auth.uid() $$, 'NOT_ALLOWED', 'patient cannot edit MRN');
select throws_ok($$ update public.patients set verified_at = now() where user_id = auth.uid() $$, 'NOT_ALLOWED', 'patient cannot self-verify');

-- ---- deactivated users lose their role for RLS purposes
select tests.logout();
update public.profiles set is_active = false where id = (select doctor from u);
select tests.login_as((select doctor from u));
select is(public.auth_role(), null, 'deactivated user has no role');

-- ---- desk-registered patient is linked on first sign-in with the same email
select tests.logout();
insert into public.patients (full_name, email, registration_source, verified_at, mrn)
values ('Walk In', 'Walk.In@x.test', 'desk', now(), 'W-1');
create temp table w as select tests.create_user('walk.in@x.test') as id;
select is((select role::text from public.profiles where id = (select id from w)), 'patient', 'desk patient gets role patient');
select is((select user_id from public.patients where mrn = 'W-1'), (select id from w), 'desk patient row linked to the new user');

select * from finish();
rollback;
