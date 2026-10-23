-- Admin data-quality rules + dashboard metrics: admin-only, every rule detects its failing row and
-- leaves the healthy one alone (PLAN.md §7.6 #1, #4).
begin;
\ir helpers/setup.psql
select plan(52);

create temp table u as select
  tests.create_user('admin@dq.test', 'admin')        as admin,
  tests.create_user('doc@dq.test', 'doctor')         as doc,
  tests.create_user('doc2@dq.test', 'doctor')        as doc2,
  tests.create_user('gone@dq.test', 'doctor')        as gone,       -- will be deactivated
  tests.create_user('desk@dq.test', 'receptionist')  as desk,
  tests.create_user('pat@dq.test', 'patient')        as pat,
  tests.create_user('comp@dq.test', 'companion')     as comp;
grant select on u to authenticated;

-- ---------------------------------------------------------------- access control
select tests.login_as((select doc from u));
select throws_ok($$ select * from public.admin_data_quality_issues() $$, 'NOT_ALLOWED', 'doctor: issues denied');
select throws_ok($$ select * from public.admin_data_quality_counts() $$, 'NOT_ALLOWED', 'doctor: counts denied');
select throws_ok($$ select * from public.admin_dashboard_metrics() $$, 'NOT_ALLOWED', 'doctor: metrics denied');
select tests.login_as((select desk from u));
select throws_ok($$ select * from public.admin_data_quality_issues() $$, 'NOT_ALLOWED', 'receptionist: issues denied');
select throws_ok($$ select * from public.admin_dashboard_metrics() $$, 'NOT_ALLOWED', 'receptionist: metrics denied');
select tests.login_as((select pat from u));
select throws_ok($$ select * from public.admin_data_quality_counts() $$, 'NOT_ALLOWED', 'patient: counts denied');
select throws_ok($$ select * from public.admin_dashboard_metrics() $$, 'NOT_ALLOWED', 'patient: metrics denied');
select tests.login_as((select comp from u));
select throws_ok($$ select * from public.admin_data_quality_issues() $$, 'NOT_ALLOWED', 'companion: issues denied');
select throws_ok($$ select * from public.admin_dashboard_metrics() $$, 'NOT_ALLOWED', 'companion: metrics denied');
select tests.logout();
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.admin_data_quality_issues() $$, '42501', null, 'anon: issues denied');
select throws_ok($$ select * from public.admin_dashboard_metrics() $$, '42501', null, 'anon: metrics denied');
select tests.logout();

-- ---------------------------------------------------------------- fixtures (as superuser)
update public.profiles set is_active = false where id = (select gone from u);

-- healthy: 20 weeks, primary, linked account, verified
create temp table fx as select tests.create_pregnancy((select pat from u), (select doc from u), 20) as healthy;
grant select on fx to authenticated;
-- no_edd: active pregnancy without any date
insert into public.patients (full_name, registration_source, verified_at, mrn) values ('NoEdd', 'desk', now(), 'DQ-1');
insert into public.pregnancies (patient_id, lmp_date) select id, null from public.patients where mrn = 'DQ-1';
-- ga_over_42: 43 weeks and still active
alter table fx add column over42 uuid, add column noprim uuid, add column inactive uuid, add column inactive_ok uuid,
  add column t3 uuid, add column t3_ok uuid, add column noedd uuid, add column deleted uuid, add column implausible uuid;
update fx set over42 = tests.create_pregnancy(null, (select doc from u), 43);
-- no_primary: verified, nobody on the team
update fx set noprim = tests.create_pregnancy(null, null, 20);
-- primary_inactive: the only doctor is deactivated; and a deactivated primary WITH an active backup (not flagged)
update fx set inactive = tests.create_pregnancy(null, (select gone from u), 20);
update fx set inactive_ok = tests.create_pregnancy(null, (select gone from u), 20);
insert into public.care_team (pregnancy_id, doctor_id, care_role) select inactive_ok, (select doc from u), 'backup' from fx;
-- t3_no_backup: 30 weeks primary only; 30 weeks with a backup (not flagged)
update fx set t3 = tests.create_pregnancy(null, (select doc from u), 30);
update fx set t3_ok = tests.create_pregnancy(null, (select doc from u), 30);
insert into public.care_team (pregnancy_id, doctor_id, care_role) select t3_ok, (select doc2 from u), 'backup' from fx;
update fx set noedd = (select id from public.pregnancies where patient_id = (select id from public.patients where mrn = 'DQ-1'));
-- a soft-deleted patient must be ignored by every rule
update fx set deleted = tests.create_pregnancy(null, null, 44);
update public.patients set deleted_at = now() where id = (select patient_id from public.pregnancies where id = (select deleted from fx));

-- unverified_14d: app registration, 15 days old (flagged) vs 13 days old (not flagged); desk-less
insert into public.patients (id, full_name, registration_source, created_at) values
  ('dd000000-0000-4000-8000-000000000001', 'Old App', 'app', now() - interval '15 days'),
  ('dd000000-0000-4000-8000-000000000002', 'New App', 'app', now() - interval '13 days');
insert into public.pregnancies (patient_id, lmp_date) values
  ('dd000000-0000-4000-8000-000000000001', public.hospital_today() - 60),
  ('dd000000-0000-4000-8000-000000000002', public.hospital_today() - 60);

-- past_booked: yesterday still booked (flagged), yesterday completed, today booked (not flagged)
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, status, booking_channel)
select x.id, pr.patient_id, pr.id, (select doc from u),
       ((public.hospital_today() + x.d) + time '10:00' + x.h * interval '1 hour') at time zone 'Asia/Kolkata',
       ((public.hospital_today() + x.d) + time '10:15' + x.h * interval '1 hour') at time zone 'Asia/Kolkata',
       x.st::public.appt_status, 'reception'
from public.pregnancies pr
cross join (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, -1, 0, 'booked'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, -1, 1, 'completed'),
  ('a0000000-0000-4000-8000-000000000003'::uuid,  0, 2, 'booked')) x(id, d, h, st)
where pr.id = (select healthy from fx);

-- consult_unpublished (2 days old, unpublished), published, and brand new
insert into public.consultations (id, pregnancy_id, doctor_id, advice, published_at, created_at) values
  ('c0000000-0000-4000-8000-000000000001', (select healthy from fx), (select doc from u), 'x', null, now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000002', (select healthy from fx), (select doc from u), 'x', now(), now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000003', (select healthy from fx), (select doc from u), 'x', null, now());
-- implausible vitals: BP 300/20 flagged; 120/80 not (the new consultation above has no vitals)
insert into public.consultations (id, pregnancy_id, doctor_id, bp_systolic, bp_diastolic, published_at) values
  ('c0000000-0000-4000-8000-000000000004', (select healthy from fx), (select doc from u), 300, 20, now()),
  ('c0000000-0000-4000-8000-000000000005', (select healthy from fx), (select doc from u), 120, 80, now());

-- lab values: unverified 3 days (flagged), verified 3 days, unverified just now
insert into public.reports (id, pregnancy_id, type, extraction_status) values
  ('e0000000-0000-4000-8000-000000000001', (select healthy from fx), 'blood', 'done'),
  ('e0000000-0000-4000-8000-000000000002', (select healthy from fx), 'blood', 'done'),
  ('e0000000-0000-4000-8000-000000000003', (select healthy from fx), 'blood', 'done');
insert into public.lab_results (report_id, pregnancy_id, test_code, value_num, source, verified, created_at) values
  ('e0000000-0000-4000-8000-000000000001', (select healthy from fx), 'HB', 10.2, 'manual', false, now() - interval '3 days'),
  ('e0000000-0000-4000-8000-000000000001', (select healthy from fx), 'PLT', 200, 'manual', false, now() - interval '3 days'),
  ('e0000000-0000-4000-8000-000000000002', (select healthy from fx), 'HB', 10.2, 'manual', true,  now() - interval '3 days'),
  ('e0000000-0000-4000-8000-000000000003', (select healthy from fx), 'HB', 10.2, 'manual', false, now());

-- AI drafts: 2 days old (flagged), 1 hour old, and a published one
insert into public.ai_summaries (id, pregnancy_id, source_type, status, generated_at, draft) values
  ('f0000000-0000-4000-8000-000000000001', (select healthy from fx), 'cumulative', 'draft', now() - interval '2 days', '{}'),
  ('f0000000-0000-4000-8000-000000000002', (select healthy from fx), 'cumulative', 'draft', now() - interval '1 hour', '{}');

-- ---------------------------------------------------------------- the rules (as admin)
-- act as the admin while still superuser, so temp tables can be created
select set_config('request.jwt.claims', json_build_object('sub', (select admin from u), 'role', 'authenticated')::text, true);
create temp table iss as select * from public.admin_data_quality_issues(null, 5000);
grant select on iss to authenticated;
select tests.login_as((select admin from u));

select ok(exists (select 1 from iss where rule = 'no_edd' and pregnancy_id = (select noedd from fx)), 'no_edd flags a pregnancy without dates');
select ok(not exists (select 1 from iss where rule = 'no_edd' and pregnancy_id = (select healthy from fx)), 'no_edd leaves a dated pregnancy alone');

select ok(exists (select 1 from iss where rule = 'ga_over_42' and pregnancy_id = (select over42 from fx)), 'ga_over_42 flags 43 weeks');
select ok(not exists (select 1 from iss where rule = 'ga_over_42' and pregnancy_id = (select healthy from fx)), 'ga_over_42 leaves 20 weeks alone');

select ok(exists (select 1 from iss where rule = 'no_primary' and pregnancy_id = (select noprim from fx)), 'no_primary flags a verified patient with no care team');
select ok(not exists (select 1 from iss where rule = 'no_primary' and pregnancy_id = (select healthy from fx)), 'no_primary leaves a pregnancy with a primary alone');
select ok(not exists (select 1 from iss where rule = 'no_primary' and patient_id = 'dd000000-0000-4000-8000-000000000001'), 'no_primary ignores an unverified self-registration');

select ok(exists (select 1 from iss where rule = 'primary_inactive' and pregnancy_id = (select inactive from fx)), 'primary_inactive flags a team whose only doctor is deactivated');
select ok(not exists (select 1 from iss where rule = 'primary_inactive' and pregnancy_id = (select inactive_ok from fx)), 'primary_inactive leaves a team with an active backup alone');
select ok(not exists (select 1 from iss where rule = 'primary_inactive' and pregnancy_id = (select healthy from fx)), 'primary_inactive leaves a healthy team alone');

select ok(exists (select 1 from iss where rule = 't3_no_backup' and pregnancy_id = (select t3 from fx)), 't3_no_backup flags 30 weeks with no backup');
select ok(not exists (select 1 from iss where rule = 't3_no_backup' and pregnancy_id = (select t3_ok from fx)), 't3_no_backup leaves 30 weeks with a backup alone');
select ok(not exists (select 1 from iss where rule = 't3_no_backup' and pregnancy_id = (select healthy from fx)), 't3_no_backup leaves second trimester alone');

select ok(exists (select 1 from iss where rule = 'unverified_14d' and patient_id = 'dd000000-0000-4000-8000-000000000001'), 'unverified_14d flags a 15-day-old app registration');
select ok(not exists (select 1 from iss where rule = 'unverified_14d' and patient_id = 'dd000000-0000-4000-8000-000000000002'), 'unverified_14d leaves a 13-day-old one alone');

select ok(exists (select 1 from iss where rule = 'past_booked' and entity_id = 'a0000000-0000-4000-8000-000000000001'), 'past_booked flags yesterday''s booked appointment');
select ok(not exists (select 1 from iss where rule = 'past_booked' and entity_id in ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003')),
  'past_booked leaves completed and today''s appointments alone');

select ok(exists (select 1 from iss where rule = 'consult_unpublished' and entity_id = 'c0000000-0000-4000-8000-000000000001'), 'consult_unpublished flags an old unpublished consultation');
select ok(not exists (select 1 from iss where rule = 'consult_unpublished' and entity_id in ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003')),
  'consult_unpublished leaves published and brand-new ones alone');

select is((select (detail ->> 'count')::int from iss where rule = 'lab_unverified_48h' and entity_id = 'e0000000-0000-4000-8000-000000000001'), 2,
  'lab_unverified_48h flags a report with 2 old unverified values');
select ok(not exists (select 1 from iss where rule = 'lab_unverified_48h' and entity_id in ('e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000003')),
  'lab_unverified_48h leaves verified and fresh values alone');

select ok(exists (select 1 from iss where rule = 'ai_draft_24h' and entity_id = 'f0000000-0000-4000-8000-000000000001'), 'ai_draft_24h flags a 2-day-old draft');
select ok(not exists (select 1 from iss where rule = 'ai_draft_24h' and entity_id = 'f0000000-0000-4000-8000-000000000002'), 'ai_draft_24h leaves a fresh draft alone');

select ok(exists (select 1 from iss where rule = 'no_app_account' and patient_id = (select patient_id from public.pregnancies where id = (select noprim from fx))), 'no_app_account flags a patient without an account');
select ok(not exists (select 1 from iss where rule = 'no_app_account' and pregnancy_id = (select healthy from fx)), 'no_app_account leaves a linked patient alone');

select is((select detail -> 'bp' ->> 'systolic' from iss where rule = 'implausible_values' and entity_id = 'c0000000-0000-4000-8000-000000000004'), '300', 'implausible_values flags BP 300/20');
select ok(not exists (select 1 from iss where rule = 'implausible_values' and entity_id = 'c0000000-0000-4000-8000-000000000005'), 'implausible_values leaves BP 120/80 alone');

select ok(not exists (select 1 from iss where pregnancy_id = (select deleted from fx)), 'a soft-deleted patient is ignored by every rule');
select ok(not exists (select 1 from iss where pregnancy_id = (select healthy from fx) and rule not in ('past_booked', 'consult_unpublished', 'lab_unverified_48h', 'ai_draft_24h', 'implausible_values')),
  'the healthy pregnancy has no structural issue');

-- ---------------------------------------------------------------- counts and rule filter
select ok((select issue_count from public.admin_data_quality_counts() where rule = 'ga_over_42') >= 1, 'counts: ga_over_42 has at least one issue');
select is((select count(*)::int from public.admin_data_quality_issues('no_edd', 100) where rule <> 'no_edd'), 0, 'rule filter returns only that rule');
select is((select count(*)::int from public.admin_data_quality_issues(null, 3)), 3, 'limit is honoured');

-- ---------------------------------------------------------------- dashboard (deltas against a baseline)
select tests.logout();
select set_config('request.jwt.claims', json_build_object('sub', (select admin from u), 'role', 'authenticated')::text, true);
create temp table m0 as select * from public.admin_dashboard_metrics();
grant select on m0 to authenticated;
-- one more high-risk 10-week pregnancy (trimester 1), one more 30-week (trimester 3), a no-show and a booking today
create temp table extra as select
  tests.create_pregnancy(null, (select doc from u), 10) as high_t1,
  tests.create_pregnancy(null, (select doc from u), 30) as plain_t3;
update public.pregnancies set risk_level = 'high' where id = (select high_t1 from extra);
insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, status, booking_channel)
select pr.patient_id, pr.id, (select doc from u),
       (public.hospital_today() + time '16:00') at time zone 'Asia/Kolkata',
       (public.hospital_today() + time '16:15') at time zone 'Asia/Kolkata', 'booked', 'reception'
from public.pregnancies pr where pr.id = (select healthy from fx);
insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, status, booking_channel)
select pr.patient_id, pr.id, (select doc from u),
       ((public.hospital_today() - 3) + time '16:00') at time zone 'Asia/Kolkata',
       ((public.hospital_today() - 3) + time '16:15') at time zone 'Asia/Kolkata', 'no_show', 'reception'
from public.pregnancies pr where pr.id = (select healthy from fx);
insert into public.ai_summaries (pregnancy_id, source_type, status, generated_at, draft)
  values ((select healthy from fx), 'cumulative', 'draft', now(), '{}');
create temp table m1 as select * from public.admin_dashboard_metrics();
grant select on m1 to authenticated;
select tests.login_as((select admin from u));

select is((select active_pregnancies from m1) - (select active_pregnancies from m0), 2, 'metrics: two more active pregnancies');
select is((select trimester_1 from m1) - (select trimester_1 from m0), 1, 'metrics: one more in trimester 1');
select is((select trimester_3 from m1) - (select trimester_3 from m0), 1, 'metrics: one more in trimester 3');
select is((select high_risk from m1) - (select high_risk from m0), 1, 'metrics: one more high-risk');
select is((select appointments_today from m1) - (select appointments_today from m0), 1, 'metrics: one more appointment today');
select is((select no_show_sample from m1) - (select no_show_sample from m0), 1, 'metrics: the no-show enters the 30-day sample');
select ok((select no_show_rate from m1) > 0, 'metrics: no-show rate is positive');
select is((select ai_pending from m1) - (select ai_pending from m0), 1, 'metrics: one more AI draft pending');
select ok((select open_issues from m1) >= (select open_issues from m0), 'metrics: open issues count only grows here');

select * from finish();
rollback;
