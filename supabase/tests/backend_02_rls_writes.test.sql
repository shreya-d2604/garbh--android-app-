-- WRITE side of the RLS matrix: the denials that must hold whatever the other agents'
-- write policies look like (their own tests cover what is ALLOWED). Plus the policies this
-- agent owns: notifications mark-read, push_tokens, register_push_token.
-- tests.write_as() returns the rows a write would touch, or -1 when it is refused; both -1
-- and 0 mean "no effect". Every write is undone.
begin;
\ir helpers/setup.psql
\ir helpers/backend.psql
select no_plan();
select tests.build_world();

-- tbl, a valid INSERT, the column to "update" to itself, and the rows of the world it targets.
create temp table ops (tbl text primary key, ins text not null, col text not null, scope text not null);
insert into ops values
 ('profiles', $$insert into public.profiles (id) values (gen_random_uuid())$$, 'role', $$email like '%@w.test'$$),
 ('staff_details', $$insert into public.staff_details (profile_id) values ((select doc_a from w))$$, 'designation', 'true'),
 ('hospital_settings', $$insert into public.hospital_settings (id, name) values (2, 'x')$$, 'name', 'true'),
 ('data_requests', $$insert into public.data_requests (user_id, kind) values ((select pat2 from w), 'export')$$, 'note', 'true'),
 ('patients', $$insert into public.patients (full_name, registration_source) values ('x', 'desk')$$, 'full_name', 'id = (select patient1 from w)'),
 ('pregnancies', $$insert into public.pregnancies (patient_id) values ((select patient1 from w))$$, 'risk_level', 'id = (select p1 from w)'),
 ('care_team', $$insert into public.care_team (pregnancy_id, doctor_id, care_role) values ((select p1 from w), (select doc_b from w), 'backup')$$, 'note', 'pregnancy_id = (select p1 from w)'),
 ('visit_templates', $$insert into public.visit_templates (seq, target_week, window_start_week, window_end_week, title) values (99, 10, 9, 11, 'x')$$, 'title', 'true'),
 ('visits', $$insert into public.visits (pregnancy_id, seq, target_week, title) values ((select p1 from w), 9, 10, 'x')$$, 'title', 'pregnancy_id = (select p1 from w)'),
 ('week_content', $$insert into public.week_content (week) values (5)$$, 'tips', 'true'),
 ('milestones', $$insert into public.milestones (key, title, week_from, week_to, category) values ('zz', 't', 1, 2, 'scan')$$, 'title', 'true'),
 ('doctor_availability', $$insert into public.doctor_availability (doctor_id, weekday, start_time, end_time) values ((select doc_a from w), 3, '10:00', '11:00')$$, 'slot_minutes', 'doctor_id = (select doc_a from w)'),
 ('doctor_time_off', $$insert into public.doctor_time_off (doctor_id, starts_at, ends_at) values ((select doc_a from w), '2033-01-01', '2033-01-02')$$, 'reason', 'doctor_id = (select doc_a from w)'),
 ('appointments', $$insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel) values ((select patient1 from w), (select p1 from w), (select doc_a from w), '2033-01-07 05:00+00', '2033-01-07 05:15+00', 'app')$$, 'reason', 'pregnancy_id = (select p1 from w)'),
 ('consultations', $$insert into public.consultations (pregnancy_id, doctor_id) values ((select p1 from w), (select doc_a from w))$$, 'advice', 'pregnancy_id = (select p1 from w)'),
 ('consultation_private_notes', $$insert into public.consultation_private_notes (consultation_id, pregnancy_id, note) values ((select c1draft from w), (select p1 from w), 'x')$$, 'note', 'pregnancy_id = (select p1 from w)'),
 ('prescription_items', $$insert into public.prescription_items (consultation_id, pregnancy_id, drug_name) values ((select c1pub from w), (select p1 from w), 'x')$$, 'drug_name', 'pregnancy_id = (select p1 from w)'),
 ('drug_catalog', $$insert into public.drug_catalog (name) values ('zz')$$, 'generic', 'true'),
 ('reports', $$insert into public.reports (pregnancy_id, type) values ((select p1 from w), 'blood')$$, 'title', 'pregnancy_id = (select p1 from w)'),
 ('report_files', $$insert into public.report_files (report_id, storage_path, mime_type) values ((select r1 from w), 'x/y/z', 'application/pdf')$$, 'mime_type', 'report_id = (select r1 from w)'),
 ('lab_tests', $$insert into public.lab_tests (code, name) values ('ZZ', 'zz')$$, 'name', 'true'),
 ('lab_results', $$insert into public.lab_results (pregnancy_id, source) values ((select p1 from w), 'manual')$$, 'raw_name', 'pregnancy_id = (select p1 from w)'),
 ('ai_summaries', $$insert into public.ai_summaries (pregnancy_id, source_type) values ((select p1 from w), 'cumulative')$$, 'doctor_note', 'pregnancy_id = (select p1 from w)'),
 ('curated_guidance', $$insert into public.curated_guidance (kind, text) values ('food_avoid', 'x')$$, 'text', 'true'),
 ('companion_invites', $$insert into public.companion_invites (patient_id, code_hash) values ((select patient1 from w), 'zz')$$, 'max_uses', 'patient_id = (select patient1 from w)'),
 ('companion_links', $$insert into public.companion_links (patient_id, companion_user_id, relation) values ((select patient1 from w), (select c_p2 from w), 'friend')$$, 'relation_note', 'patient_id = (select patient1 from w)'),
 ('code_redeem_attempts', $$insert into public.code_redeem_attempts (user_id, success) values ((select c_full from w), false)$$, 'success', 'true'),
 ('notifications', $$insert into public.notifications (user_id, type, title) values ((select pat2 from w), 't', 'x')$$, 'title', $$type = 'matrix_test'$$),
 ('push_tokens', $$insert into public.push_tokens (user_id, expo_push_token) values ((select pat2 from w), 'ExponentPushToken[other]')$$, 'platform', $$expo_push_token like 'ExponentPushToken[w-%'$$),
 ('audit_log', $$insert into public.audit_log (action, table_name) values ('insert', 'x')$$, 'table_name', $$table_name = 'matrix_test'$$);

-- Sanity: the update/delete scopes really contain world rows, so a 0 means "refused", not "nothing there".
select cmp_ok(tests.visible((select admin from w), format('select 1 from public.%I where %s', o.tbl, o.scope)), '>', 0::bigint, 'scope has rows: ' || o.tbl)
from (select * from ops order by tbl) o;

-- Who may NOT write what (role -> tables), for insert / update / delete alike.
create temp table denied (who text, tbl text);
-- patient, companions of every state and a signed-in user without a role: nothing but their own
-- profile contact fields, notification read flags, push tokens and (patient) contact columns.
insert into denied select who, tbl from unnest(array['pat1','c_full','c_rev','c_pend','nobody']) who cross join ops;
-- receptionist: never clinical, companion, catalog, settings or personal-data tables
insert into denied select 'desk', tbl from unnest(array[
  'consultations','consultation_private_notes','prescription_items','reports','report_files','lab_results','ai_summaries',
  'care_team','companion_invites','companion_links','code_redeem_attempts','notifications','push_tokens','audit_log',
  'hospital_settings','staff_details','visit_templates','week_content','milestones','lab_tests','drug_catalog',
  'curated_guidance','doctor_availability','doctor_time_off','profiles','data_requests']) tbl;
-- doctors who are NOT on P1's care team (removed backup / other patient's doctor)
insert into denied select who, tbl from unnest(array['doc_x','doc_b']) who cross join unnest(array[
  'care_team','visits','consultations','consultation_private_notes','prescription_items','reports','report_files','lab_results',
  'ai_summaries','appointments','companion_invites','companion_links','code_redeem_attempts','notifications','push_tokens',
  'audit_log','hospital_settings','visit_templates','week_content','milestones','lab_tests','drug_catalog','curated_guidance',
  'data_requests','profiles']) tbl;
-- the team doctor: AI drafts, care team and appointments only change through RPCs; no admin tables
insert into denied select 'doc_a', tbl from unnest(array[
  'ai_summaries','care_team','appointments','companion_invites','companion_links','code_redeem_attempts','notifications',
  'push_tokens','audit_log','hospital_settings','visit_templates','week_content','milestones','lab_tests','drug_catalog',
  'curated_guidance','data_requests','profiles']) tbl;
-- doctors may not write another doctor's schedule (inserting a row for doc_a)
insert into denied select who, tbl from unnest(array['doc_b','doc_c','doc_x']) who cross join unnest(array['doctor_availability','doctor_time_off']) tbl;

-- Exceptions: self-service writes that ARE allowed on rows the user owns.
create temp table allowed (who text, tbl text, op text);
insert into allowed values
  ('pat1', 'patients', 'update'),       -- contact fields (column guard trigger)
  ('pat1', 'push_tokens', 'update'), ('pat1', 'push_tokens', 'delete');

select ok(tests.write_as((to_jsonb(w) ->> d.who)::uuid, o.ins) <= 0,
          format('%s cannot INSERT into %s', d.who, d.tbl))
from (select * from denied order by who, tbl) d join ops o using (tbl) cross join w;

select ok(tests.write_as((to_jsonb(w) ->> d.who)::uuid,
                         format('update public.%I set %I = %I where %s', d.tbl, o.col, o.col, o.scope)) <= 0,
          format('%s cannot UPDATE %s', d.who, d.tbl))
from (select * from denied order by who, tbl) d join ops o using (tbl) cross join w
where not exists (select 1 from allowed a where a.who = d.who and a.tbl = d.tbl and a.op = 'update');

select ok(tests.write_as((to_jsonb(w) ->> d.who)::uuid, format('delete from public.%I where %s', d.tbl, o.scope)) <= 0,
          format('%s cannot DELETE from %s', d.who, d.tbl))
from (select * from denied order by who, tbl) d join ops o using (tbl) cross join w
where not exists (select 1 from allowed a where a.who = d.who and a.tbl = d.tbl and a.op = 'delete');

-- audit_log is append-only even for admin; code_redeem_attempts is read-only for admin.
select is(tests.write_as((select admin from w), $$update public.audit_log set table_name = 'x'$$), -1, 'admin cannot UPDATE audit_log');
select is(tests.write_as((select admin from w), $$delete from public.audit_log$$), -1, 'admin cannot DELETE audit_log');
select is(tests.write_as((select admin from w), (select ins from ops where tbl = 'audit_log')), -1, 'admin cannot INSERT audit_log');
select is(tests.write_as((select admin from w), (select ins from ops where tbl = 'code_redeem_attempts')), -1, 'admin cannot INSERT code_redeem_attempts');
select ok(tests.write_as((select admin from w), 'update public.consultations set advice = advice') >= 3, 'admin can update clinical rows (admin_all)');
select ok(tests.write_as((select admin from w), 'delete from public.week_content where week = 7') >= 0, 'admin can delete catalog rows (admin_all)');

-- Role self-escalation is blocked (PLAN.md §13).
select is(tests.write_as((select pat1 from w), $$update public.profiles set role = 'admin' where id = (select pat1 from w)$$), -1, 'patient cannot make herself admin');
select is(tests.write_as((select doc_a from w), $$update public.profiles set role = 'admin' where id = (select doc_a from w)$$), -1, 'doctor cannot make himself admin');
select is(tests.write_as((select doc_a from w), $$update public.profiles set is_active = true where id = (select doc_a from w)$$), -1, 'users cannot touch is_active');
select is(tests.write_as((select nobody from w), $$update public.profiles set role = 'doctor' where id = (select nobody from w)$$), -1, 'a user without a role cannot pick a staff role');
select is(tests.write_as((select pat1 from w), $$update public.profiles set full_name = 'New Name' where id = (select pat1 from w)$$), 1, 'a user can edit her own name');
select is(tests.write_as((select pat1 from w), $$update public.profiles set full_name = 'Hijack' where id = (select pat2 from w)$$), 0, 'but not another profile');

----------------------------------------------------------------------------
-- notifications: mark read (read_at only), own rows only
----------------------------------------------------------------------------
select is(tests.write_as((select pat1 from w), $$update public.notifications set read_at = now() where type = 'matrix_test'$$), 1, 'patient marks her own notification read');
select is(tests.write_as((select pat1 from w), $$update public.notifications set read_at = null where type = 'matrix_test'$$), 1, 'and can mark it unread');
select is(tests.write_as((select c_full from w), $$update public.notifications set read_at = now() where type = 'matrix_test'$$), 1, 'companion marks her own notification read');
select is(tests.write_as((select doc_a from w), $$update public.notifications set read_at = now() where type = 'matrix_test'$$), 1, 'doctor marks his own notification read');
select is(tests.write_as((select pat1 from w), $$update public.notifications set read_at = now() where user_id = (select pat2 from w)$$), 0, 'nobody marks someone else''s notification');
select is(tests.write_as((select pat1 from w), $$update public.notifications set title = 'edited' where type = 'matrix_test'$$), -1, 'only read_at is writable (column privilege)');
select is(tests.write_as((select pat1 from w), $$update public.notifications set body = 'x', data = '{}', user_id = (select pat2 from w) where type = 'matrix_test'$$), -1, 'body/data/user_id are not writable');
select is(tests.write_as((select pat1 from w), $$update public.notifications set push_sent_at = now() where type = 'matrix_test'$$), -1, 'push bookkeeping is not writable');
select is(tests.write_as((select pat1 from w), $$delete from public.notifications where type = 'matrix_test'$$), 0, 'a user cannot delete notifications');
select is(tests.write_as((select pat1 from w), $$insert into public.notifications (user_id, type, title) values ((select pat1 from w), 't', 'forged')$$), -1, 'a user cannot forge a notification, not even for herself');
select is(tests.write_as((select admin from w), $$insert into public.notifications (user_id, type, title) values ((select pat1 from w), 't', 'x')$$), 1, 'admin_all still applies to notifications');

----------------------------------------------------------------------------
-- push_tokens: self insert / update / delete
----------------------------------------------------------------------------
select is(tests.write_as((select pat1 from w), $$insert into public.push_tokens (user_id, expo_push_token, platform) values ((select pat1 from w), 'ExponentPushToken[mine]', 'android')$$), 1, 'user registers her own token');
select is(tests.write_as((select pat1 from w), $$insert into public.push_tokens (user_id, expo_push_token) values ((select pat2 from w), 'ExponentPushToken[theirs]')$$), -1, 'user cannot register a token for someone else');
select is(tests.write_as((select pat1 from w), $$update public.push_tokens set platform = 'ios' where user_id = (select pat1 from w)$$), 1, 'user updates her own token');
select is(tests.write_as((select pat1 from w), $$update public.push_tokens set user_id = (select pat2 from w) where user_id = (select pat1 from w)$$), -1, 'user cannot hand her token to someone else');
select is(tests.write_as((select pat1 from w), $$update public.push_tokens set platform = 'x' where user_id = (select pat2 from w)$$), 0, 'user cannot edit another user''s token');
select is(tests.write_as((select pat1 from w), $$delete from public.push_tokens where user_id = (select pat2 from w)$$), 0, 'user cannot delete another user''s token');
select is(tests.write_as((select pat1 from w), $$delete from public.push_tokens where user_id = (select pat1 from w)$$), 1, 'user deletes her own token (sign-out)');
select is(tests.write_as((select nobody from w), $$insert into public.push_tokens (user_id, expo_push_token) values ((select nobody from w), 'ExponentPushToken[nobody]')$$), -1, 'a user without a role cannot register a token');
select is(tests.visible((select doc_a from w), 'select 1 from public.push_tokens'), 0::bigint, 'a doctor sees nobody''s push tokens');

----------------------------------------------------------------------------
-- register_push_token(): upsert that moves a token between users on a shared device
----------------------------------------------------------------------------
select tests.login_as((select pat1 from w));
select lives_ok($$select public.register_push_token('ExponentPushToken[device-1]', 'android')$$, 'register_push_token inserts');
select lives_ok($$select public.register_push_token('ExponentPushToken[device-1]', 'android')$$, 'and is idempotent');
select throws_ok($$select public.register_push_token('not-a-token', 'android')$$, 'INVALID_INPUT', 'rejects garbage tokens');
select throws_ok($$select public.register_push_token(null, null)$$, 'INVALID_INPUT', 'rejects null');
select is((select count(*)::int from public.push_tokens where expo_push_token = 'ExponentPushToken[device-1]'), 1, 'one row per token');
select tests.login_as((select pat2 from w));
select lives_ok($$select public.register_push_token('ExponentPushToken[device-1]', 'ios')$$, 'a second user signing in on the same device takes the token over');
select is((select count(*)::int from public.push_tokens where expo_push_token = 'ExponentPushToken[device-1]'), 1, 'the new owner sees it');
select tests.login_as((select pat1 from w));
select is((select count(*)::int from public.push_tokens where expo_push_token = 'ExponentPushToken[device-1]'), 0, 'the previous owner no longer has it (no pushes to the wrong person)');
select tests.login_as((select nobody from w));
select throws_ok($$select public.register_push_token('ExponentPushToken[device-2]', 'ios')$$, 'NOT_ALLOWED', 'a user without a role cannot register');
select tests.logout();
select set_config('request.jwt.claims', '', true);
select set_config('role', 'authenticated', true);
select throws_ok($$select public.register_push_token('ExponentPushToken[device-3]', 'ios')$$, 'NOT_AUTHENTICATED', 'no JWT, no registration');
select tests.logout();
select is(has_function_privilege('anon', 'public.register_push_token(text,text)', 'execute'), false, 'anon cannot call register_push_token');

select * from finish();
rollback;
