-- Smoke test of the foundation read policies (the full role x table matrix is owned by the
-- backend agent: backend_*_rls_matrix.test.sql). Also: no-overlap constraint, care-team trigger.
begin;
\ir helpers/setup.psql
select plan(26);

create temp table u as select
  tests.create_user('a@x.test', 'doctor')       as doc_a,
  tests.create_user('b@x.test', 'doctor')       as doc_b,
  tests.create_user('r@x.test', 'receptionist') as desk,
  tests.create_user('p@x.test', 'patient')      as pat,
  tests.create_user('p2@x.test', 'patient')     as pat2,
  tests.create_user('c@x.test', 'companion')    as comp,
  tests.create_user('ad@x.test', 'admin')       as admin;
create temp table t as select tests.create_pregnancy((select pat from u), (select doc_a from u), 24) as preg;
create temp table t2 as select tests.create_pregnancy((select pat2 from u), (select doc_b from u), 10) as preg;
create temp table ids as select
  (select patient_id from public.pregnancies where id = (select preg from t)) as patient;
grant select on u, t, t2, ids to authenticated;

insert into public.consultations (pregnancy_id, doctor_id, advice, published_at)
values ((select preg from t), (select doc_a from u), 'published advice', now()),
       ((select preg from t), (select doc_a from u), 'draft advice', null);
insert into public.ai_summaries (pregnancy_id, source_type, status, draft) values
  ((select preg from t), 'report', 'draft', '{"summary":{"headline":"draft"}}');
insert into public.ai_summaries (pregnancy_id, source_type, status, final, reviewed_by, published_at) values
  ((select preg from t), 'report', 'published', '{"summary":{"headline":"ok","doctor_attention_flags":["x"]}}', (select doc_a from u), now());
insert into public.companion_links (patient_id, companion_user_id, relation, status, can_view_appointments, can_view_summaries)
values ((select patient from ids), (select comp from u), 'husband', 'approved', true, false);

-- ---- care-team doctor
select tests.login_as((select doc_a from u));
select is((select count(*)::int from public.patients), 1, 'doctor A sees only her care-team patient');
select is((select count(*)::int from public.consultations), 2, 'doctor A sees published + draft consultations');
select is((select count(*)::int from public.ai_summaries), 2, 'doctor A sees AI drafts');
select is((select count(*)::int from public.doctor_directory where id in ((select doc_a from u), (select doc_b from u))), 2, 'doctor directory lists active doctors');

-- ---- doctor not on the care team: zero rows, not errors
select tests.login_as((select doc_b from u));
select is((select count(*)::int from public.patients where id = (select patient from ids)), 0, 'doctor B cannot see the patient');
select is((select count(*)::int from public.pregnancies where id = (select preg from t)), 0, 'doctor B: no pregnancy');
select is((select count(*)::int from public.consultations), 0, 'doctor B: no consultations');
select is((select count(*)::int from public.visits where pregnancy_id = (select preg from t)), 0, 'doctor B: no visits');

-- backup added -> access; removed -> access gone immediately
select tests.logout();
insert into public.care_team (pregnancy_id, doctor_id, care_role) values ((select preg from t), (select doc_b from u), 'backup');
select tests.login_as((select doc_b from u));
select is((select count(*)::int from public.consultations), 2, 'backup doctor sees consultations');
select tests.logout();
update public.care_team set removed_at = now() where doctor_id = (select doc_b from u) and pregnancy_id = (select preg from t);
select tests.login_as((select doc_b from u));
select is((select count(*)::int from public.consultations), 0, 'removed backup loses access at once');

-- ---- receptionist: demographics yes, clinical never
select tests.login_as((select desk from u));
select ok((select count(*) from public.patients) >= 2, 'receptionist sees patients');
select is((select count(*)::int from public.consultations), 0, 'receptionist: no consultations');
select is((select count(*)::int from public.ai_summaries), 0, 'receptionist: no AI summaries');
select is((select count(*)::int from public.published_summaries), 0, 'receptionist: no published summaries');

-- ---- patient
select tests.login_as((select pat from u));
select is((select count(*)::int from public.patients), 1, 'patient sees only herself');
select is((select advice from public.consultations), 'published advice', 'patient sees only published consultations');
select is((select count(*)::int from public.ai_summaries), 0, 'patient cannot read ai_summaries');
select is((select final from public.published_summaries), '{"summary":{"headline":"ok"}}'::jsonb,
          'published_summaries strips doctor_attention_flags');
select throws_ok(
  $$ insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
     values ((select patient from ids), (select preg from t), (select doc_a from u), now() + interval '1 day', now() + interval '1 day 15 min', 'app') $$,
  '42501', null, 'patient cannot insert appointments directly');
select is((select count(*)::int from public.pregnancies where id = (select preg from t2)), 0, 'patient cannot see another pregnancy');

-- ---- companion: per-permission
select tests.login_as((select comp from u));
select is((select count(*)::int from public.patients), 1, 'companion sees the linked patient');
select is((select count(*)::int from public.care_team where removed_at is null), 1, 'companion with appointments perm sees care team');
select is((select count(*)::int from public.consultations), 0, 'companion without summaries perm: no consultations');
select is((select count(*)::int from public.pregnancies), 0, 'companion without journey perm: no pregnancy');

-- ---- DB-level guards
select tests.logout();
insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
values ((select patient from ids), (select preg from t), (select doc_a from u), '2030-01-07 05:00+00', '2030-01-07 05:15+00', 'reception');
select throws_ok(
  $$ insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
     values ((select patient from ids), (select preg from t), (select doc_a from u), '2030-01-07 05:10+00', '2030-01-07 05:25+00', 'reception') $$,
  '23P01', null, 'no_doctor_overlap rejects a double booking');
select throws_ok(
  $$ insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
     values ((select patient from ids), (select preg from t), (select doc_b from u), '2030-01-08 05:00+00', '2030-01-08 05:15+00', 'reception') $$,
  'NOT_ON_CARE_TEAM', 'appointment doctor must be on the active care team');

select * from finish();
rollback;
