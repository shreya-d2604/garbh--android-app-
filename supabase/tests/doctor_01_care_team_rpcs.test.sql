-- Care-team RPCs (docs/contracts.md §3): add_backup_doctor, remove_care_team_member, hand_over_primary.
begin;
\ir helpers/setup.psql
\ir helpers/doctor.psql
select plan(60);

create temp table u as select
  tests.create_user('prim@x.test',   'doctor')       as prim,
  tests.create_user('backup@x.test', 'doctor')       as backup,
  tests.create_user('other@x.test',  'doctor')       as other,
  tests.create_user('newdoc@x.test', 'doctor')       as newdoc,
  tests.create_user('extra@x.test',  'doctor')       as extra,
  tests.create_user('gone@x.test',   'doctor')       as inactive,
  tests.create_user('desk@x.test',   'receptionist') as desk,
  tests.create_user('pat@x.test',    'patient')      as pat,
  tests.create_user('comp@x.test',   'companion')    as comp,
  tests.create_user('admin@x.test',  'admin')        as admin;
update public.profiles set is_active = false where id = (select inactive from u);
create temp table t as select tests.create_pregnancy((select pat from u), (select prim from u), 24) as preg;
create temp table t_nobody as select tests.create_pregnancy(null, null, 12) as preg;   -- no care team at all
insert into public.care_team (pregnancy_id, doctor_id, care_role) values ((select preg from t), (select backup from u), 'backup');
insert into public.companion_links (patient_id, companion_user_id, relation, status, can_view_appointments, can_view_journey,
                                    can_view_summaries, can_view_reports, can_view_prescriptions)
values ((select patient_id from public.pregnancies where id = (select preg from t)), (select comp from u), 'husband', 'approved', true, true, true, true, true);
grant select on u, t, t_nobody to authenticated;

-- ---------------------------------------------------------------- privileges
select is(has_function_privilege('anon', 'public.add_backup_doctor(uuid,uuid,text)', 'execute'), false, 'anon cannot add backups');
select is(has_function_privilege('anon', 'public.remove_care_team_member(uuid,uuid)', 'execute'), false, 'anon cannot remove members');
select is(has_function_privilege('anon', 'public.hand_over_primary(uuid,uuid)', 'execute'), false, 'anon cannot hand over');

-- ---------------------------------------------------------------- primary adds a backup
select tests.login_as((select prim from u));
select lives_ok($$ select public.add_backup_doctor((select preg from t), (select newdoc from u), 'Covers leave') $$,
  'primary adds a backup doctor');
select is((select count(*)::int from public.care_team where pregnancy_id = (select preg from t) and removed_at is null), 3,
  'care team now has 3 active members');
select ok(exists (select 1 from public.care_team where pregnancy_id = (select preg from t) and doctor_id = (select newdoc from u)
                    and care_role = 'backup' and added_by = (select prim from u) and note = 'Covers leave'),
  'new member is a backup, added_by the primary, with the note');
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select newdoc from u)) $$,
  'P0001', 'ALREADY_LINKED', 'adding an active backup again: ALREADY_LINKED');
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select prim from u)) $$,
  'P0001', 'ALREADY_LINKED', 'adding the primary as a backup: ALREADY_LINKED');
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select inactive from u)) $$,
  'P0001', 'INVALID_INPUT', 'an inactive doctor cannot be added');
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select desk from u)) $$,
  'P0001', 'INVALID_INPUT', 'a non-doctor cannot be added');
select throws_ok($$ select public.add_backup_doctor((select preg from t), gen_random_uuid()) $$,
  'P0001', 'INVALID_INPUT', 'an unknown profile cannot be added');
select throws_ok($$ select public.add_backup_doctor((select preg from t), null) $$,
  'P0001', 'INVALID_INPUT', 'a null doctor cannot be added');

-- the new backup sees the chart at once
select tests.login_as((select newdoc from u));
select is((select count(*)::int from public.pregnancies where id = (select preg from t)), 1, 'new backup sees the pregnancy');

-- ---------------------------------------------------------------- direct writes stay closed
select tests.login_as((select prim from u));
select throws_ok($$ insert into public.care_team (pregnancy_id, doctor_id, care_role) values ((select preg from t), (select extra from u), 'backup') $$,
  '42501', null, 'primary cannot insert into care_team directly');
select is(tests.affected($$ update public.care_team set care_role = 'primary' where doctor_id = (select newdoc from u) $$), 0,
  'primary cannot update care_team directly');
select is(tests.affected($$ delete from public.care_team where doctor_id = (select newdoc from u) $$), 0,
  'primary cannot delete from care_team directly');

-- ---------------------------------------------------------------- remove
select throws_ok($$ select public.remove_care_team_member((select preg from t), (select prim from u)) $$,
  'P0001', 'INVALID_INPUT', 'the primary cannot be removed (hand over first)');
select throws_ok($$ select public.remove_care_team_member((select preg from t), (select other from u)) $$,
  'P0001', 'NOT_FOUND', 'removing a doctor who is not on the team: NOT_FOUND');
select lives_ok($$ select public.remove_care_team_member((select preg from t), (select newdoc from u)) $$,
  'primary removes a backup');
select ok(exists (select 1 from public.care_team where doctor_id = (select newdoc from u) and pregnancy_id = (select preg from t)
                    and removed_at is not null and removed_by = (select prim from u)),
  'removal is soft: removed_at + removed_by are set, the row stays');
select throws_ok($$ select public.remove_care_team_member((select preg from t), (select newdoc from u)) $$,
  'P0001', 'NOT_FOUND', 'removing the same backup twice: NOT_FOUND');
select tests.login_as((select newdoc from u));
select is((select count(*)::int from public.pregnancies where id = (select preg from t)), 0, 'removed backup loses access at once');
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select extra from u)) $$,
  'P0001', 'PRIMARY_REQUIRED', 'removed backup cannot add doctors');

-- a removed backup can be added again
select tests.login_as((select prim from u));
select lives_ok($$ select public.add_backup_doctor((select preg from t), (select newdoc from u)) $$, 're-adding a removed backup works');
select is((select count(*)::int from public.care_team where pregnancy_id = (select preg from t) and doctor_id = (select newdoc from u)), 2,
  're-adding keeps the history row');

-- ---------------------------------------------------------------- a backup cannot manage the team
select tests.login_as((select backup from u));
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select extra from u)) $$,
  'P0001', 'PRIMARY_REQUIRED', 'backup cannot add a doctor');
select throws_ok($$ select public.remove_care_team_member((select preg from t), (select newdoc from u)) $$,
  'P0001', 'PRIMARY_REQUIRED', 'backup cannot remove a doctor');
select throws_ok($$ select public.hand_over_primary((select preg from t), (select backup from u)) $$,
  'P0001', 'PRIMARY_REQUIRED', 'backup cannot make herself primary');

-- ---------------------------------------------------------------- a doctor not on the team
select tests.login_as((select other from u));
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select other from u)) $$,
  'P0001', 'PRIMARY_REQUIRED', 'doctor not on the team cannot add');
select throws_ok($$ select public.remove_care_team_member((select preg from t), (select newdoc from u)) $$,
  'P0001', 'PRIMARY_REQUIRED', 'doctor not on the team cannot remove');
select throws_ok($$ select public.hand_over_primary((select preg from t), (select other from u)) $$,
  'P0001', 'PRIMARY_REQUIRED', 'doctor not on the team cannot take over');
select throws_ok($$ select public.add_backup_doctor((select preg from t_nobody), (select other from u)) $$,
  'P0001', 'PRIMARY_REQUIRED', 'doctor cannot add to a pregnancy with no care team');

-- ---------------------------------------------------------------- other roles
select tests.login_as((select desk from u));
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select extra from u)) $$,
  'P0001', 'NOT_ALLOWED', 'receptionist cannot add');
select throws_ok($$ select public.remove_care_team_member((select preg from t), (select newdoc from u)) $$,
  'P0001', 'NOT_ALLOWED', 'receptionist cannot remove');
select throws_ok($$ select public.hand_over_primary((select preg from t), (select backup from u)) $$,
  'P0001', 'NOT_ALLOWED', 'receptionist cannot hand over');
select tests.login_as((select pat from u));
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select extra from u)) $$,
  'P0001', 'NOT_ALLOWED', 'patient cannot add');
select throws_ok($$ select public.hand_over_primary((select preg from t), (select backup from u)) $$,
  'P0001', 'NOT_ALLOWED', 'patient cannot hand over');
select tests.login_as((select comp from u));
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select extra from u)) $$,
  'P0001', 'NOT_ALLOWED', 'companion cannot add');
select throws_ok($$ select public.remove_care_team_member((select preg from t), (select backup from u)) $$,
  'P0001', 'NOT_ALLOWED', 'companion cannot remove');

-- ---------------------------------------------------------------- hand over
select tests.login_as((select prim from u));
select throws_ok($$ select public.hand_over_primary((select preg from t), (select prim from u)) $$,
  'P0001', 'INVALID_INPUT', 'handing over to the current primary: INVALID_INPUT');
select throws_ok($$ select public.hand_over_primary((select preg from t), (select inactive from u)) $$,
  'P0001', 'INVALID_INPUT', 'cannot hand over to an inactive doctor');
select throws_ok($$ select public.hand_over_primary((select preg from t), (select desk from u)) $$,
  'P0001', 'INVALID_INPUT', 'cannot hand over to a non-doctor');
select lives_ok($$ select public.hand_over_primary((select preg from t), (select backup from u)) $$,
  'primary hands over to an existing backup');
select is((select count(*)::int from public.care_team where pregnancy_id = (select preg from t) and care_role = 'primary' and removed_at is null), 1,
  'still exactly one active primary');
select is((select doctor_id from public.care_team where pregnancy_id = (select preg from t) and care_role = 'primary' and removed_at is null),
  (select backup from u), 'the former backup is now the primary');
select is((select care_role::text from public.care_team where pregnancy_id = (select preg from t) and doctor_id = (select prim from u) and removed_at is null),
  'backup', 'the old primary became a backup');
select is((select count(*)::int from public.pregnancies where id = (select preg from t)), 1, 'old primary keeps access as a backup');
select throws_ok($$ select public.add_backup_doctor((select preg from t), (select extra from u)) $$,
  'P0001', 'PRIMARY_REQUIRED', 'old primary can no longer add doctors');

-- the new primary can; and can hand over to a doctor who was not on the team
select tests.login_as((select backup from u));
select lives_ok($$ select public.add_backup_doctor((select preg from t), (select extra from u)) $$, 'new primary can add a backup');
select lives_ok($$ select public.hand_over_primary((select preg from t), (select other from u)) $$,
  'primary hands over to a doctor who was not on the team');
select is((select doctor_id from public.care_team where pregnancy_id = (select preg from t) and care_role = 'primary' and removed_at is null),
  (select other from u), 'the outsider is now the primary');
select tests.login_as((select other from u));
select is((select count(*)::int from public.pregnancies where id = (select preg from t)), 1, 'the new primary sees the pregnancy');

-- ---------------------------------------------------------------- admin
select tests.login_as((select admin from u));
select lives_ok($$ select public.remove_care_team_member((select preg from t), (select extra from u)) $$, 'admin removes a backup');
select lives_ok($$ select public.hand_over_primary((select preg from t), (select prim from u)) $$, 'admin changes the primary');
select lives_ok($$ select public.hand_over_primary((select preg from t_nobody), (select prim from u)) $$,
  'admin can set a primary where there is none');
select is((select count(*)::int from public.care_team where pregnancy_id = (select preg from t_nobody) and care_role = 'primary' and removed_at is null), 1,
  'the pregnancy without a team now has a primary');
select throws_ok($$ select public.add_backup_doctor(gen_random_uuid(), (select extra from u)) $$,
  'P0001', 'NOT_FOUND', 'unknown pregnancy: NOT_FOUND (admin)');

select * from finish();
rollback;
