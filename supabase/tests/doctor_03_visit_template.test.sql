-- apply_visit_template(): switch still-planned visits to the standard / high_risk schedule.
begin;
\ir helpers/setup.psql
\ir helpers/doctor.psql
select plan(23);

create temp table u as select
  tests.create_user('prim@x.test',   'doctor')       as prim,
  tests.create_user('backup@x.test', 'doctor')       as backup,
  tests.create_user('other@x.test',  'doctor')       as other,
  tests.create_user('desk@x.test',   'receptionist') as desk,
  tests.create_user('pat@x.test',    'patient')      as pat,
  tests.create_user('admin@x.test',  'admin')        as admin;
-- Exactly 24w0d today. The pregnancy trigger created the 12 standard visits (all planned).
create temp table t as select tests.create_pregnancy((select pat from u), (select prim from u), 24) as preg;
insert into public.care_team (pregnancy_id, doctor_id, care_role) values ((select preg from t), (select backup from u), 'backup');
create temp table ids as select (select patient_id from public.pregnancies where id = (select preg from t)) as pt;
grant select on u, t, ids to authenticated;

-- history: visits 1-4 completed, visit 5 (24w) booked; one extra visit by the doctor.
update public.visits set status = 'completed' where pregnancy_id = (select preg from t) and seq <= 4;
update public.visits set status = 'scheduled' where pregnancy_id = (select preg from t) and seq = 5;
insert into public.visits (pregnancy_id, seq, target_week, title, is_extra, reason_added, added_by, due_from, due_to)
values ((select preg from t), 13, 25, 'BP follow-up', true, 'High BP', (select prim from u), current_date + 3, current_date + 5);

select is(has_function_privilege('anon', 'public.apply_visit_template(uuid,text)', 'execute'), false, 'anon cannot apply templates');

select tests.login_as((select prim from u));
select throws_ok($$ select public.apply_visit_template((select preg from t), 'weekly') $$, 'P0001', 'INVALID_INPUT', 'unknown schedule: INVALID_INPUT');
select throws_ok($$ select public.apply_visit_template((select preg from t), null) $$, 'P0001', 'INVALID_INPUT', 'null schedule: INVALID_INPUT');
select lives_ok($$ select public.apply_visit_template((select preg from t), 'high_risk') $$, 'primary switches to the high-risk template');

select is((select count(*)::int from public.visits where pregnancy_id = (select preg from t) and status = 'completed'), 4, 'completed visits are kept');
select is((select count(*)::int from public.visits where pregnancy_id = (select preg from t) and status = 'scheduled'), 1, 'the booked visit is kept');
select is((select count(*)::int from public.visits where pregnancy_id = (select preg from t) and is_extra), 1, 'extra visits are kept');
select is((select array_agg(target_week order by target_week) from public.visits where pregnancy_id = (select preg from t) and status = 'planned' and not is_extra),
  array[26,28,30,32,34,36,37,38,39,40]::smallint[], 'planned visits are the high-risk weeks whose window is still open and not already covered');
select is((select count(distinct seq)::int from public.visits where pregnancy_id = (select preg from t)),
  (select count(*)::int from public.visits where pregnancy_id = (select preg from t)), 'visit sequence numbers stay unique');
select is((select min(due_from) from public.visits where pregnancy_id = (select preg from t) and status = 'planned' and not is_extra),
  public.hospital_today() + 25 * 7 - 24 * 7, 'due windows are computed from the due date (26w window opens at 25w0d)');

-- idempotent
select lives_ok($$ select public.apply_visit_template((select preg from t), 'high_risk') $$, 'applying again is harmless');
select is((select count(*)::int from public.visits where pregnancy_id = (select preg from t) and status = 'planned' and not is_extra), 10, 'still 10 planned visits');

-- back to standard
select lives_ok($$ select public.apply_visit_template((select preg from t), 'standard') $$, 'primary switches back to the standard template');
select is((select array_agg(target_week order by target_week) from public.visits where pregnancy_id = (select preg from t) and status = 'planned' and not is_extra),
  array[28,30,32,34,36,38,40]::smallint[], 'standard weeks return');

-- backup may; outsiders may not
select tests.login_as((select backup from u));
select lives_ok($$ select public.apply_visit_template((select preg from t), 'high_risk') $$, 'a backup doctor can switch the template');
select tests.login_as((select other from u));
select throws_ok($$ select public.apply_visit_template((select preg from t), 'standard') $$, 'P0001', 'NOT_ALLOWED', 'doctor not on the team: NOT_ALLOWED');
select tests.login_as((select desk from u));
select throws_ok($$ select public.apply_visit_template((select preg from t), 'standard') $$, 'P0001', 'NOT_ALLOWED', 'receptionist: NOT_ALLOWED');
select tests.login_as((select pat from u));
select throws_ok($$ select public.apply_visit_template((select preg from t), 'standard') $$, 'P0001', 'NOT_ALLOWED', 'patient: NOT_ALLOWED');
select tests.logout();
select is((select count(*)::int from public.visits where pregnancy_id = (select preg from t) and status = 'planned' and not is_extra), 10,
  'denied callers changed nothing');

-- admin, unknown pregnancy, pregnancy without a due date
select tests.login_as((select admin from u));
select lives_ok($$ select public.apply_visit_template((select preg from t), 'standard') $$, 'admin can switch the template');
select throws_ok($$ select public.apply_visit_template(gen_random_uuid(), 'standard') $$, 'P0001', 'NOT_FOUND', 'unknown pregnancy: NOT_FOUND');
select tests.logout();
create temp table t_nolmp as select gen_random_uuid() as preg, gen_random_uuid() as pt;
insert into public.patients (id, full_name, registration_source) values ((select pt from t_nolmp), 'No LMP', 'app');
insert into public.pregnancies (id, patient_id, lmp_date) values ((select preg from t_nolmp), (select pt from t_nolmp), null);
grant select on t_nolmp to authenticated;
select tests.login_as((select admin from u));
select throws_ok($$ select public.apply_visit_template((select preg from t_nolmp), 'standard') $$, 'P0001', 'INVALID_INPUT', 'no due date: INVALID_INPUT');

select tests.logout();
select is((select count(*)::int from public.audit_log where table_name = 'visits' and action = 'insert' and actor_id = (select backup from u)), 10,
  'template changes are audit-logged against the caller (10 visits inserted by the backup)');

select * from finish();
rollback;
