-- decide_companion_link / end_companion_link: ownership, permissions, status transitions.
begin;
\ir helpers/setup.psql
select plan(33);

create temp table u as select
  tests.create_user('doc@x.test',  'doctor')    as doc,
  tests.create_user('p1@x.test',   'patient')   as pat,
  tests.create_user('p2@x.test',   'patient')   as pat2,
  tests.create_user('c1@x.test',   'companion') as c1,
  tests.create_user('c2@x.test',   'companion') as c2,
  tests.create_user('c3@x.test',   'companion') as c3;
create temp table preg as select
  tests.create_pregnancy((select pat from u),  (select doc from u), 20) as p1,
  tests.create_pregnancy((select pat2 from u), (select doc from u), 12) as p2;
create temp table pt as select
  (select patient_id from public.pregnancies where id = (select p1 from preg)) as p1,
  (select patient_id from public.pregnancies where id = (select p2 from preg)) as p2;
-- Three pending requests to patient 1 and one to patient 2 (written as the superuser; the RPCs
-- that create them are covered by companion_02).
create temp table lk as select
  gen_random_uuid() as a, gen_random_uuid() as b, gen_random_uuid() as c, gen_random_uuid() as other;
insert into public.companion_links (id, patient_id, companion_user_id, relation) values
  ((select a from lk),     (select p1 from pt), (select c1 from u), 'husband'),
  ((select b from lk),     (select p1 from pt), (select c2 from u), 'mother'),
  ((select c from lk),     (select p1 from pt), (select c3 from u), 'friend'),
  ((select other from lk), (select p2 from pt), (select c1 from u), 'sibling');
grant select on u, preg, pt, lk to authenticated;

-- ---- decide: who may call it
select tests.login_as((select c1 from u));
select throws_ok($$ select public.decide_companion_link((select a from lk), true, '{"journey":true}') $$,
  'NOT_ALLOWED', null, 'a companion cannot approve her own request');
select tests.login_as((select doc from u));
select throws_ok($$ select public.decide_companion_link((select a from lk), true) $$,
  'NOT_ALLOWED', null, 'a doctor cannot approve');
select tests.login_as((select pat2 from u));
select throws_ok($$ select public.decide_companion_link((select a from lk), true) $$,
  'NOT_ALLOWED', null, 'a different patient cannot approve');
select throws_ok($$ select public.decide_companion_link((select a from lk), false) $$,
  'NOT_ALLOWED', null, 'a different patient cannot reject');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.decide_companion_link((select a from lk), true) $$,
  'NOT_AUTHENTICATED', null, 'signed-out caller is rejected');

select tests.login_as((select pat from u));
select throws_ok($$ select public.decide_companion_link(gen_random_uuid(), true) $$, 'NOT_FOUND', null, 'unknown link');
select throws_ok($$ select public.decide_companion_link((select a from lk), true, '{"journey":"yes"}') $$,
  'INVALID_INPUT', null, 'a non-boolean permission is rejected');
select throws_ok($$ select public.decide_companion_link((select a from lk), true, '{"labs":true}') $$,
  'INVALID_INPUT', null, 'an unknown permission key is rejected');
select throws_ok($$ select public.decide_companion_link((select a from lk), true, '[true]') $$,
  'INVALID_INPUT', null, 'permissions must be an object');
select throws_ok($$ select public.decide_companion_link((select a from lk), null) $$,
  'INVALID_INPUT', null, 'p_approve is required');

-- ---- approve with permissions (missing = false)
select public.decide_companion_link((select a from lk), true,
  '{"appointments":true,"journey":true,"summaries":true,"notifications":true}');
select is((select status::text from public.companion_links where id = (select a from lk)), 'approved', 'pending -> approved');
select is((select row(can_view_appointments, can_view_journey, can_view_summaries, can_view_reports,
                      can_view_prescriptions, receive_notifications)::text
           from public.companion_links where id = (select a from lk)),
          '(t,t,t,f,f,t)', 'flags follow p_perms, missing keys are false');
select isnt((select decided_at from public.companion_links where id = (select a from lk)), null, 'decided_at is stamped');

-- ---- approve without perms = all off; update flags on an approved link
select public.decide_companion_link((select b from lk), true);
select is((select row(can_view_appointments, can_view_journey, can_view_summaries, can_view_reports,
                      can_view_prescriptions, receive_notifications)::text
           from public.companion_links where id = (select b from lk)),
          '(f,f,f,f,f,f)', 'approving without p_perms grants nothing');
select public.decide_companion_link((select a from lk), true, '{"reports":true,"prescriptions":true}');
select is((select row(status::text, can_view_appointments, can_view_journey, can_view_reports,
                      can_view_prescriptions, receive_notifications)::text
           from public.companion_links where id = (select a from lk)),
          '(approved,f,f,t,t,f)', 'approve on an approved link replaces the permission flags');
select throws_ok($$ select public.decide_companion_link((select a from lk), false) $$,
  'INVALID_STATUS_CHANGE', null, 'an approved link cannot be "rejected" (revoke it instead)');

-- ---- reject
select public.decide_companion_link((select c from lk), false, '{"journey":true}');
select is((select row(status::text, can_view_journey)::text from public.companion_links where id = (select c from lk)),
          '(rejected,f)', 'pending -> rejected, no permissions kept');
select throws_ok($$ select public.decide_companion_link((select c from lk), true) $$,
  'INVALID_STATUS_CHANGE', null, 'a rejected link cannot be approved later');
select throws_ok($$ select public.decide_companion_link((select c from lk), false) $$,
  'INVALID_STATUS_CHANGE', null, 'a rejected link cannot be rejected again');

-- ---- end: who may call it
select tests.login_as((select c3 from u));
select throws_ok($$ select public.end_companion_link((select a from lk)) $$,
  'NOT_ALLOWED', null, 'another companion cannot end the link');
select tests.login_as((select pat2 from u));
select throws_ok($$ select public.end_companion_link((select a from lk)) $$,
  'NOT_ALLOWED', null, 'another patient cannot revoke the link');
select tests.login_as((select doc from u));
select throws_ok($$ select public.end_companion_link((select a from lk)) $$,
  'NOT_ALLOWED', null, 'a doctor cannot end the link');
select tests.login_as((select pat from u));
select throws_ok($$ select public.end_companion_link(gen_random_uuid()) $$, 'NOT_FOUND', null, 'unknown link');
select throws_ok($$ select public.end_companion_link((select c from lk)) $$,
  'INVALID_STATUS_CHANGE', null, 'a rejected link cannot be ended');

-- ---- patient revokes, companion leaves
select public.end_companion_link((select a from lk));
select is((select status::text from public.companion_links where id = (select a from lk)), 'revoked', 'patient: approved -> revoked');
select throws_ok($$ select public.end_companion_link((select a from lk)) $$,
  'INVALID_STATUS_CHANGE', null, 'a revoked link cannot be ended again');
select throws_ok($$ select public.decide_companion_link((select a from lk), true) $$,
  'INVALID_STATUS_CHANGE', null, 'a revoked link cannot be re-approved');

select tests.login_as((select c2 from u));
select public.end_companion_link((select b from lk));
select is((select status::text from public.companion_links where id = (select b from lk)), 'left', 'companion: approved -> left');

-- a companion can also withdraw a pending request; the patient can revoke a pending one
select tests.login_as((select c1 from u));
select public.end_companion_link((select other from lk));
select is((select status::text from public.companion_links where id = (select other from lk)), 'left', 'companion: pending -> left');

-- ---- direct writes are impossible
select tests.login_as((select pat from u));
update public.companion_links set status = 'approved', can_view_reports = true where id = (select c from lk);
select is((select row(status::text, can_view_reports)::text from public.companion_links where id = (select c from lk)),
  '(rejected,f)', 'patients cannot update links directly (no update policy)');
select throws_ok(
  $$ insert into public.companion_links (patient_id, companion_user_id, relation, status)
     values ((select p1 from pt), (select c3 from u), 'friend', 'approved') $$,
  '42501', null, 'patients cannot insert links directly');
select is((select count(*)::int from public.companion_links), 3, 'patient 1 sees only her own three links');
select tests.login_as((select c3 from u));
select is((select count(*)::int from public.companion_links), 1, 'a companion sees only her own link rows');

select * from finish();
rollback;
