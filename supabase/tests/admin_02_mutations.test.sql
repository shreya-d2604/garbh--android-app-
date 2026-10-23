-- Admin mutations: admin-only RPCs, reasons, hard delete audit, care team, DPDP requests,
-- configuration audit (PLAN.md §7.6 #3, #5, #7).
begin;
\ir helpers/setup.psql
select plan(78);

create temp table u as select
  tests.create_user('admin@m.test', 'admin')        as admin,
  tests.create_user('doc@m.test', 'doctor')         as doc,
  tests.create_user('doc2@m.test', 'doctor')        as doc2,
  tests.create_user('doc3@m.test', 'doctor')        as doc3,
  tests.create_user('desk@m.test', 'receptionist')  as desk,
  tests.create_user('pat@m.test', 'patient')        as pat,
  tests.create_user('pat2@m.test', 'patient')       as pat2,
  tests.create_user('comp@m.test', 'companion')     as comp,
  tests.create_user('nurse@m.test', 'receptionist') as other_desk;
create temp table fx as select
  tests.create_pregnancy((select pat from u), (select doc from u), 20)   as preg,
  tests.create_pregnancy((select pat2 from u), (select doc from u), 12)  as preg_h;
create temp table ids as select
  (select patient_id from public.pregnancies where id = (select preg from fx))   as patient,
  (select patient_id from public.pregnancies where id = (select preg_h from fx)) as patient_h;
grant select on u, fx, ids to authenticated;

-- ---------------------------------------------------------------- admin-only
select tests.login_as((select doc from u));
select throws_ok($$ select public.admin_create_patient('{"full_name":"X","mrn":"M-1"}') $$, 'NOT_ALLOWED', 'doctor cannot create a patient');
select throws_ok(format($$ select public.admin_set_patient_deleted(%L, true, 'because') $$, (select patient from ids)), 'NOT_ALLOWED', 'doctor cannot soft delete');
select throws_ok(format($$ select public.admin_hard_delete_patient(%L, 'because') $$, (select patient from ids)), 'NOT_ALLOWED', 'doctor cannot hard delete');
select throws_ok(format($$ select public.admin_update_pregnancy_dates(%L, null, null, 'x') $$, (select preg from fx)), 'NOT_ALLOWED', 'doctor cannot fix dates');
select throws_ok(format($$ select public.admin_set_primary_doctor(%L, %L) $$, (select preg from fx), (select doc2 from u)), 'NOT_ALLOWED', 'doctor cannot set the primary');
select throws_ok(format($$ select public.admin_add_backup_doctor(%L, %L) $$, (select preg from fx), (select doc2 from u)), 'NOT_ALLOWED', 'doctor cannot add a backup via the admin RPC');
select throws_ok(format($$ select public.admin_remove_care_team_member(%L, %L) $$, (select preg from fx), (select doc from u)), 'NOT_ALLOWED', 'doctor cannot remove via the admin RPC');
select throws_ok($$ select public.admin_resolve_data_request(gen_random_uuid(), 'done') $$, 'NOT_ALLOWED', 'doctor cannot resolve requests');
select tests.login_as((select desk from u));
select throws_ok($$ select public.admin_create_patient('{"full_name":"X","mrn":"M-1"}') $$, 'NOT_ALLOWED', 'receptionist cannot create a patient via the admin RPC');
select throws_ok(format($$ select public.admin_hard_delete_patient(%L, 'because') $$, (select patient from ids)), 'NOT_ALLOWED', 'receptionist cannot hard delete');
select tests.login_as((select pat from u));
select throws_ok(format($$ select public.admin_hard_delete_patient(%L, 'because') $$, (select patient from ids)), 'NOT_ALLOWED', 'patient cannot hard delete herself');
select tests.login_as((select comp from u));
select throws_ok(format($$ select public.admin_set_patient_deleted(%L, true, 'because') $$, (select patient from ids)), 'NOT_ALLOWED', 'companion cannot soft delete');

-- ---------------------------------------------------------------- create patient
select tests.login_as((select admin from u));
create temp table created as select public.admin_create_patient(format(
  '{"full_name":"Created One","mrn":"ADM-1","phone":"+919800000999","lmp_date":"%s","primary_doctor":"%s"}',
  public.hospital_today() - 70, (select doc2 from u))::jsonb) as id;
grant select on created to authenticated;
select results_eq(
  $$ select registration_source, is_verified, mrn from public.patients where id = (select id from created) $$,
  $$ values ('desk'::text, true, 'ADM-1'::text) $$, 'created patient is a verified desk record');
select results_eq(
  $$ select pr.lmp_source, ct.care_role::text, ct.doctor_id = (select doc2 from u)
     from public.pregnancies pr join public.care_team ct on ct.pregnancy_id = pr.id where pr.patient_id = (select id from created) $$,
  $$ values ('clinician'::text, 'primary'::text, true) $$, 'pregnancy with the chosen primary doctor');
select ok((select count(*) from public.visits v join public.pregnancies pr on pr.id = v.pregnancy_id where pr.patient_id = (select id from created)) > 0, 'visit plan generated');
select throws_ok($$ select public.admin_create_patient('{"full_name":"Dup","mrn":"ADM-1"}') $$, 'MRN_TAKEN', 'duplicate MRN is refused');
select throws_ok($$ select public.admin_create_patient('{"full_name":"No MRN"}') $$, 'INVALID_INPUT', 'MRN is required');
select throws_ok(format($$ select public.admin_create_patient('{"full_name":"Bad doc","mrn":"ADM-2","lmp_date":"%s","primary_doctor":"%s"}') $$,
  public.hospital_today() - 30, (select desk from u)), 'INVALID_INPUT', 'primary doctor must be a doctor');
select throws_ok($$ select public.admin_create_patient('{"full_name":"Future","mrn":"ADM-3","lmp_date":"2999-01-01"}') $$, 'INVALID_INPUT', 'future LMP is refused');
select is((select count(*)::int from public.audit_log where table_name = 'patients' and action = 'insert' and actor_id = (select admin from u)
           and patient_id = (select id from created)), 1, 'patient creation is audit-logged with the admin as actor');

-- ---------------------------------------------------------------- soft delete / restore
select throws_ok(format($$ select public.admin_set_patient_deleted(%L, true) $$, (select patient from ids)), 'INVALID_INPUT', 'soft delete needs a reason');
select lives_ok(format($$ select public.admin_set_patient_deleted(%L, true, 'Duplicate of another record') $$, (select patient from ids)), 'admin soft deletes');
select isnt((select deleted_at from public.patients where id = (select patient from ids)), null, 'deleted_at is set');
select is((select new ->> 'reason' from public.audit_log where table_name = 'patients' and new ->> 'event' = 'soft_delete'
           and patient_id = (select patient from ids)), 'Duplicate of another record', 'soft delete audit row carries the reason');
select throws_ok(format($$ select public.admin_set_patient_deleted(%L, true, 'again') $$, (select patient from ids)), 'INVALID_STATUS_CHANGE', 'cannot delete twice');
select is((select count(*)::int from public.patients where id = (select patient from ids) and public.auth_role() = 'admin'), 1, 'admin still sees the soft-deleted patient');
select lives_ok(format($$ select public.admin_set_patient_deleted(%L, false) $$, (select patient from ids)), 'admin restores');
select is((select deleted_at from public.patients where id = (select patient from ids)), null, 'deleted_at is cleared');
select throws_ok(format($$ select public.admin_set_patient_deleted(%L, false) $$, (select patient from ids)), 'INVALID_STATUS_CHANGE', 'cannot restore a live patient');

-- ---------------------------------------------------------------- fix LMP / EDD
select tests.logout();
create temp table v_before as select due_from, due_to from public.visits
  where pregnancy_id = (select preg from fx) and seq = 1;
grant select on v_before to authenticated;
select tests.login_as((select admin from u));
select throws_ok(format($$ select public.admin_update_pregnancy_dates(%L, %L, null, '') $$, (select preg from fx), public.hospital_today() - 70), 'INVALID_INPUT', 'a reason is required for a date fix');
select throws_ok(format($$ select public.admin_update_pregnancy_dates(%L, null, null, 'typo') $$, (select preg from fx)), 'INVALID_INPUT', 'at least one date is required');
select throws_ok(format($$ select public.admin_update_pregnancy_dates(%L, %L, null, 'typo') $$, (select preg from fx), public.hospital_today() + 5), 'INVALID_INPUT', 'a future LMP is refused');
select throws_ok(format($$ select public.admin_update_pregnancy_dates(%L, %L, null, 'typo') $$, (select preg from fx), public.hospital_today() - 400), 'INVALID_INPUT', 'an LMP older than 300 days is refused for an active pregnancy');
select lives_ok(format($$ select public.admin_update_pregnancy_dates(%L, %L, null, 'Entered wrong month') $$, (select preg from fx), public.hospital_today() - 70), 'admin fixes the LMP');
select results_eq(
  format($$ select lmp_date, lmp_source from public.pregnancies where id = %L $$, (select preg from fx)),
  format($$ values (%L::date, 'clinician'::text) $$, public.hospital_today() - 70), 'LMP updated');
select is((select v.due_from - (select due_from from v_before) from public.visits v where v.pregnancy_id = (select preg from fx) and v.seq = 1), 70,
  'planned visits moved with the new EDD (trigger)');
select is((select new ->> 'reason' from public.audit_log where table_name = 'pregnancies' and new ->> 'event' = 'fix_dates'
           and record_id = (select preg from fx)::text), 'Entered wrong month', 'date fix audit row carries the reason');

-- ---------------------------------------------------------------- care team
select throws_ok(format($$ select public.admin_set_primary_doctor(%L, %L) $$, (select preg from fx), (select desk from u)), 'INVALID_INPUT', 'primary must be a doctor');
select lives_ok(format($$ select public.admin_add_backup_doctor(%L, %L, 'Covers leave') $$, (select preg from fx), (select doc2 from u)), 'admin adds a backup');
select throws_ok(format($$ select public.admin_add_backup_doctor(%L, %L) $$, (select preg from fx), (select doc2 from u)), 'ALREADY_LINKED', 'a doctor already on the team cannot be added again');
select lives_ok(format($$ select public.admin_set_primary_doctor(%L, %L) $$, (select preg from fx), (select doc2 from u)), 'admin promotes the backup to primary');
select results_eq(
  format($$ select ct.doctor_id = (select doc from u), ct.care_role::text from public.care_team ct
            where ct.pregnancy_id = %L and ct.removed_at is null order by ct.care_role $$, (select preg from fx)),
  $$ values (false, 'primary'::text), (true, 'backup'::text) $$, 'old primary stays as a backup, new doctor is primary');
select throws_ok(format($$ select public.admin_remove_care_team_member(%L, %L) $$, (select preg from fx), (select doc2 from u)), 'INVALID_INPUT', 'the primary cannot be removed');
select lives_ok(format($$ select public.admin_remove_care_team_member(%L, %L) $$, (select preg from fx), (select doc from u)), 'admin removes the backup');
select isnt((select removed_at from public.care_team where pregnancy_id = (select preg from fx) and doctor_id = (select doc from u)), null, 'removal is soft (removed_at set)');
select throws_ok(format($$ select public.admin_remove_care_team_member(%L, %L) $$, (select preg from fx), (select doc from u)), 'NOT_FOUND', 'removing someone not on the team');
-- pregnancy with no primary at all (the hand-over RPC cannot express this)
select tests.logout();
create temp table orphan as select tests.create_pregnancy(null, null, 20) as preg;
update public.profiles set is_active = false where id = (select doc3 from u);
grant select on orphan to authenticated;
select tests.login_as((select admin from u));
select throws_ok(format($$ select public.admin_set_primary_doctor(%L, %L) $$, (select preg from orphan), (select doc3 from u)), 'INVALID_INPUT', 'a deactivated doctor cannot be assigned');
select lives_ok(format($$ select public.admin_set_primary_doctor(%L, %L) $$, (select preg from orphan), (select doc from u)), 'admin assigns a primary where there was none');
select is((select care_role::text from public.care_team where pregnancy_id = (select preg from orphan) and removed_at is null), 'primary', 'the new row is the primary');
select ok((select count(*) from public.audit_log where table_name = 'care_team' and actor_id = (select admin from u)) >= 3, 'care-team changes are audit-logged with the admin as actor');

-- ---------------------------------------------------------------- hard delete
select tests.logout();
insert into public.reports (id, pregnancy_id, type) values ('e1000000-0000-4000-8000-000000000001', (select preg_h from fx), 'blood');
insert into public.report_files (report_id, storage_path, mime_type) values
  ('e1000000-0000-4000-8000-000000000001', 'p/q/r/one.pdf', 'application/pdf'),
  ('e1000000-0000-4000-8000-000000000001', 'p/q/r/two.pdf', 'application/pdf');
insert into public.consultations (pregnancy_id, doctor_id, advice) values ((select preg_h from fx), (select doc from u), 'x');
select tests.login_as((select admin from u));
select throws_ok(format($$ select public.admin_hard_delete_patient(%L, 'oops') $$, (select patient_h from ids)), 'INVALID_INPUT', 'hard delete needs a reason of 5+ characters');
select throws_ok($$ select public.admin_hard_delete_patient(gen_random_uuid(), 'a real reason') $$, 'NOT_FOUND', 'hard delete of an unknown patient');
select throws_ok(format($$ select public.admin_hard_delete_patient(%L, 'Entered in error') $$, (select patient_h from ids)), 'SOFT_DELETE_REQUIRED', 'hard delete requires a soft delete first');
select lives_ok(format($$ select public.admin_set_patient_deleted(%L, true, 'Duplicate chart') $$, (select patient_h from ids)), 'admin soft-deletes before the permanent delete');
create temp table hd as select public.admin_hard_delete_patient((select patient_h from ids), 'Entered in error, duplicate chart') as paths;
grant select on hd to authenticated;
select is((select paths from hd), array['p/q/r/one.pdf', 'p/q/r/two.pdf'], 'hard delete returns the storage paths to remove');
select is((select count(*)::int from public.patients where id = (select patient_h from ids)), 0, 'the patient row is gone');
select is((select count(*)::int from public.pregnancies where id = (select preg_h from fx)), 0, 'her pregnancy is gone (cascade)');
select is((select count(*)::int from public.consultations where pregnancy_id = (select preg_h from fx)), 0, 'her consultations are gone (cascade)');
select is((select new ->> 'reason' from public.audit_log where table_name = 'patients' and action = 'delete'
           and new ->> 'event' = 'hard_delete' and patient_id = (select patient_h from ids)), 'Entered in error, duplicate chart', 'hard delete wrote an audit row with the reason');
select ok((select count(*) from public.audit_log where table_name = 'pregnancies' and action = 'delete' and patient_id = (select patient_h from ids)) >= 1, 'the cascade is audited row by row');
select is((select is_active from public.profiles where id = (select pat2 from u)), false, 'her app account is deactivated');

-- ---------------------------------------------------------------- DPDP requests
select tests.login_as((select pat from u));
select lives_ok($$ insert into public.data_requests (user_id, kind) values (auth.uid(), 'deletion') $$, 'a user can file her own request');
select throws_ok(format($$ insert into public.data_requests (user_id, kind) values (%L, 'deletion') $$, (select comp from u)), '42501', null, 'a user cannot file a request for someone else');
select throws_ok($$ insert into public.data_requests (user_id, kind, status) values (auth.uid(), 'export', 'done') $$, '42501', null, 'a user cannot file an already-closed request');
select tests.login_as((select comp from u));
select lives_ok($$ insert into public.data_requests (user_id, kind) values (auth.uid(), 'export') $$, 'another user files an export request');
select is((select count(*)::int from public.data_requests), 1, 'a user reads only her own requests');
select tests.login_as((select admin from u));
create temp table req as select
  (select id from public.data_requests where user_id = (select pat from u)) as del,
  (select id from public.data_requests where user_id = (select comp from u)) as exp;
grant select on req to authenticated;
select ok((select count(*) from public.data_requests where id in ((select del from req), (select exp from req))) = 2, 'the admin reads every request');
select throws_ok($$ select public.admin_resolve_data_request((select del from req), 'bogus') $$, 'INVALID_INPUT', 'unknown status is refused');
select throws_ok($$ select public.admin_resolve_data_request((select del from req), 'done') $$, 'INVALID_STATUS_CHANGE', 'a deletion cannot be marked done here');
select lives_ok($$ select public.admin_resolve_data_request((select del from req), 'in_progress', 'Looking into it') $$, 'admin starts a request');
select lives_ok($$ select public.admin_resolve_data_request((select exp from req), 'done', 'Sent by email') $$, 'admin completes an export request');
select results_eq(
  $$ select status, resolved_by = (select admin from u), resolved_at is not null from public.data_requests where id = (select exp from req) $$,
  $$ values ('done'::text, true, true) $$, 'resolver and time recorded');
select throws_ok($$ select public.admin_resolve_data_request((select exp from req), 'rejected') $$, 'INVALID_STATUS_CHANGE', 'a closed request cannot be reopened');
select ok((select count(*) from public.audit_log where table_name = 'data_requests' and action = 'update' and actor_id = (select admin from u)) >= 2, 'request handling is audit-logged');

-- ---------------------------------------------------------------- configuration audit
update public.hospital_settings set min_lead_hours = 3 where id = 1;
select is((select count(*)::int from public.audit_log where table_name = 'hospital_settings' and action = 'update' and actor_id = (select admin from u)), 1, 'hospital settings change is audit-logged');
insert into public.lab_tests (code, name, unit) values ('ZZ_TEST', 'Test value', 'u');
update public.lab_tests set name = 'Test value 2' where code = 'ZZ_TEST';
delete from public.lab_tests where code = 'ZZ_TEST';
select is((select array_agg(action order by id) from public.audit_log where table_name = 'lab_tests' and record_id = 'ZZ_TEST' and actor_id = (select admin from u)),
  array['insert', 'update', 'delete'], 'catalog insert/update/delete are audit-logged by code');
select tests.login_as((select doc from u));
select throws_ok($$ insert into public.drug_catalog (name) values ('Hacked') $$, '42501', null, 'a doctor cannot edit the drug catalog');
select tests.login_as((select desk from u));
select throws_ok($$ insert into public.curated_guidance (kind, text) values ('food_avoid', 'Hacked') $$, '42501', null, 'a receptionist cannot edit curated guidance');

select * from finish();
rollback;
