-- Notification triggers (PLAN.md §8.5, §11, contracts §6): who is told, with which deep link,
-- who is NOT told, and the push dispatch. Runs as the superuser; auth.uid() is faked with
-- request.jwt.claims where the "actor" matters.
begin;
\ir helpers/setup.psql
\ir helpers/backend.psql
select no_plan();
select tests.build_world();
-- c_jour has the notification switch on but not the appointments permission.
update public.companion_links set receive_notifications = true where companion_user_id = (select c_jour from w);
-- c_appt has the permission but the switch is off (already false in the world).

create function tests.n(p_uid uuid, p_type text) returns int language sql as
  $$ select count(*)::int from public.notifications where user_id = p_uid and type = p_type $$;
create function tests.route(p_uid uuid, p_type text) returns text language sql as
  $$ select data ->> 'route' from public.notifications where user_id = p_uid and type = p_type order by created_at desc, id limit 1 $$;
create function tests.act_as(p_uid uuid) returns void language sql as
  $$ select set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid)::text end, true) $$;

----------------------------------------------------------------------------
-- Appointments
----------------------------------------------------------------------------
delete from public.notifications;
create temp table x as select gen_random_uuid() as a1, gen_random_uuid() as a2;
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel, booked_by)
values ((select a1 from x), (select patient1 from w), (select p1 from w), (select doc_a from w),
        '2034-01-03 05:00+00', '2034-01-03 05:15+00', 'reception', (select desk from w));

select is(tests.n((select pat1 from w), 'appointment_booked'), 1, 'booking: patient notified');
select is(tests.route((select pat1 from w), 'appointment_booked'), '/patient/appointments/' || (select a1 from x), 'booking: patient deep link');
select is(tests.n((select c_full from w), 'appointment_booked'), 1, 'booking: companion with permission + switch notified');
select is(tests.route((select c_full from w), 'appointment_booked'), '/companion/' || (select patient1 from w) || '/appointments', 'booking: companion deep link');
select is(tests.n((select c_appt from w), 'appointment_booked'), 0, 'booking: permission but switch off -> not notified');
select is(tests.n((select c_jour from w), 'appointment_booked'), 0, 'booking: switch on but no appointments permission -> not notified');
select is(tests.n((select c_none from w), 'appointment_booked'), 0, 'booking: companion without permissions not notified');
select is(tests.n((select c_rev from w), 'appointment_booked') + tests.n((select c_pend from w), 'appointment_booked'), 0, 'booking: revoked and pending companions not notified');
select is(tests.n((select doc_a from w), 'appointment_booked'), 1, 'booking: the appointment''s doctor notified');
select is(tests.route((select doc_a from w), 'appointment_booked'), '/doctor/today', 'booking: doctor deep link');
select is(tests.n((select doc_c from w), 'appointment_booked'), 0, 'booking: other care-team doctors are not');
select is(tests.n((select desk from w), 'appointment_booked') + tests.n((select admin from w), 'appointment_booked'), 0, 'booking: reception and admin get no notification');
select is(tests.n((select pat2 from w), 'appointment_booked'), 0, 'booking: another patient not notified');

-- completed / historic rows do not notify
delete from public.notifications;
insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, status, booking_channel)
values ((select patient1 from w), (select p1 from w), (select doc_a from w), '2034-01-04 05:00+00', '2034-01-04 05:15+00', 'completed', 'reception');
select is((select count(*)::int from public.notifications), 0, 'a historic (completed) appointment notifies nobody');

-- the doctor booking for himself is not told about his own action
delete from public.notifications;
select tests.act_as((select doc_a from w));
insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel, booked_by)
values ((select patient1 from w), (select p1 from w), (select doc_a from w), '2034-01-05 05:00+00', '2034-01-05 05:15+00', 'doctor', (select doc_a from w));
select tests.act_as(null);
select is(tests.n((select doc_a from w), 'appointment_booked'), 0, 'the acting doctor is not notified of his own booking');
select is(tests.n((select pat1 from w), 'appointment_booked'), 1, 'but the patient still gets her confirmation');

-- changed (time moved) and cancelled
delete from public.notifications;
update public.appointments set starts_at = '2034-01-03 07:00+00', ends_at = '2034-01-03 07:15+00' where id = (select a1 from x);
select is(tests.n((select pat1 from w), 'appointment_changed'), 1, 'change: patient notified');
select is(tests.n((select c_full from w), 'appointment_changed'), 1, 'change: companion notified');
select is(tests.n((select doc_a from w), 'appointment_changed'), 1, 'change: doctor notified');
update public.appointments set reason = 'just a note' where id = (select a1 from x);
select is(tests.n((select pat1 from w), 'appointment_changed'), 1, 'editing other fields does not notify again');
update public.appointments set status = 'confirmed' where id = (select a1 from x);
select is(tests.n((select pat1 from w), 'appointment_changed'), 1, 'booked -> confirmed is not a change');

delete from public.notifications;
update public.appointments set status = 'cancelled', cancelled_reason = 'x' where id = (select a1 from x);
select is(tests.n((select pat1 from w), 'appointment_cancelled'), 1, 'cancel: patient notified');
select is(tests.n((select c_full from w), 'appointment_cancelled'), 1, 'cancel: companion notified');
select is(tests.n((select doc_a from w), 'appointment_cancelled'), 1, 'cancel: doctor notified');
select is(tests.route((select pat1 from w), 'appointment_cancelled'), '/patient/appointments/' || (select a1 from x), 'cancel: deep link');

-- patient checked in -> the doctor only
delete from public.notifications;
update public.appointments set status = 'booked' where id = (select a1 from x);
delete from public.notifications;
update public.appointments set status = 'checked_in', checked_in_at = now() where id = (select a1 from x);
select is(tests.n((select doc_a from w), 'patient_checked_in'), 1, 'check-in: doctor notified');
select is(tests.route((select doc_a from w), 'patient_checked_in'), '/doctor/today', 'check-in: deep link');
select is((select count(*)::int from public.notifications where user_id <> (select doc_a from w)), 0, 'check-in: nobody else notified');

-- reschedule = cancel old + book new in one transaction: ONE "changed" notice, either order
delete from public.notifications;
create temp table r as select gen_random_uuid() as old1, gen_random_uuid() as new1, gen_random_uuid() as old2, gen_random_uuid() as new2;
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
values ((select old1 from r), (select patient1 from w), (select p1 from w), (select doc_a from w), '2034-02-03 05:00+00', '2034-02-03 05:15+00', 'app'),
       ((select old2 from r), (select patient1 from w), (select p1 from w), (select doc_a from w), '2034-02-04 05:00+00', '2034-02-04 05:15+00', 'app');
delete from public.notifications;
-- order A: cancel first, then insert the successor
update public.appointments set status = 'cancelled' where id = (select old1 from r);
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel, rescheduled_from)
values ((select new1 from r), (select patient1 from w), (select p1 from w), (select doc_a from w), '2034-02-03 06:00+00', '2034-02-03 06:15+00', 'app', (select old1 from r));
select is(tests.n((select pat1 from w), 'appointment_changed'), 1, 'reschedule (cancel first): patient gets one "changed"');
select is(tests.n((select pat1 from w), 'appointment_cancelled') + tests.n((select pat1 from w), 'appointment_booked'), 0, 'reschedule (cancel first): no cancelled/booked noise for the patient');
select is(tests.n((select c_full from w), 'appointment_changed'), 1, 'reschedule (cancel first): companion gets one "changed"');
select is(tests.n((select doc_a from w), 'appointment_changed'), 1, 'reschedule (cancel first): same doctor gets one "changed"');
select is(tests.n((select doc_a from w), 'appointment_cancelled'), 0, 'reschedule (cancel first): same doctor gets no "cancelled"');
delete from public.notifications;
-- order B: insert the successor first, then cancel the old one
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel, rescheduled_from)
values ((select new2 from r), (select patient1 from w), (select p1 from w), (select doc_a from w), '2034-02-04 06:00+00', '2034-02-04 06:15+00', 'app', (select old2 from r));
update public.appointments set status = 'cancelled' where id = (select old2 from r);
select is(tests.n((select pat1 from w), 'appointment_changed'), 1, 'reschedule (insert first): patient gets one "changed"');
select is(tests.n((select pat1 from w), 'appointment_cancelled'), 0, 'reschedule (insert first): no "cancelled"');
select is(tests.n((select doc_a from w), 'appointment_changed') + tests.n((select doc_a from w), 'appointment_cancelled'), 1, 'reschedule (insert first): the doctor hears once');

-- reschedule to ANOTHER doctor: old doctor loses the visit, new doctor gets a booking
delete from public.notifications;
create temp table r2 as select gen_random_uuid() as old3, gen_random_uuid() as new3;
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
values ((select old3 from r2), (select patient1 from w), (select p1 from w), (select doc_a from w), '2034-03-03 05:00+00', '2034-03-03 05:15+00', 'app');
delete from public.notifications;
update public.appointments set status = 'cancelled' where id = (select old3 from r2);
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel, rescheduled_from)
values ((select new3 from r2), (select patient1 from w), (select p1 from w), (select doc_c from w), '2034-03-03 05:00+00', '2034-03-03 05:15+00', 'app', (select old3 from r2));
select is(tests.n((select doc_a from w), 'appointment_cancelled'), 1, 'reschedule to another doctor: the old doctor is told it was cancelled');
select is(tests.n((select doc_c from w), 'appointment_booked'), 1, 'reschedule to another doctor: the new doctor gets a booking');
select is(tests.n((select pat1 from w), 'appointment_changed'), 1, 'reschedule to another doctor: the patient gets one "changed"');
select is(tests.n((select pat1 from w), 'appointment_cancelled'), 0, 'reschedule to another doctor: and no "cancelled"');

-- doctor time off over a booked appointment -> patient + companion "please rebook"
delete from public.notifications;
create temp table t as select gen_random_uuid() as ap, gen_random_uuid() as off;
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
values ((select ap from t), (select patient1 from w), (select p1 from w), (select doc_a from w), '2034-04-03 05:00+00', '2034-04-03 05:15+00', 'reception');
delete from public.notifications;
insert into public.doctor_time_off (id, doctor_id, starts_at, ends_at) values ((select off from t), (select doc_a from w), '2034-04-03 00:00+00', '2034-04-04 00:00+00');
select is(tests.n((select pat1 from w), 'appointment_changed'), 1, 'time off: patient told to rebook');
select is(tests.route((select pat1 from w), 'appointment_changed'), '/patient/appointments/' || (select ap from t), 'time off: deep link to the appointment');
select is(tests.n((select c_full from w), 'appointment_changed'), 1, 'time off: companion told');
select is(tests.n((select pat2 from w), 'appointment_changed'), 0, 'time off: unaffected patients are not');
update public.doctor_time_off set ends_at = '2034-04-05 00:00+00' where id = (select off from t);
select is(tests.n((select pat1 from w), 'appointment_changed'), 1, 'time off: extending the leave does not notify twice');

----------------------------------------------------------------------------
-- Account verified at the desk
----------------------------------------------------------------------------
delete from public.notifications;
update public.patients set verified_at = null where id = (select patient1 from w);
update public.patients set verified_at = now() where id = (select patient1 from w);
select is(tests.n((select pat1 from w), 'account_verified'), 1, 'verification: patient notified');
select is(tests.route((select pat1 from w), 'account_verified'), '/patient', 'verification: deep link');
update public.patients set full_name = 'Renamed' where id = (select patient1 from w);
select is(tests.n((select pat1 from w), 'account_verified'), 1, 'verification: only when verified_at is first set');
select is(tests.n((select c_full from w), 'account_verified'), 0, 'verification: companions are not told');
insert into public.patients (full_name, registration_source, verified_at) values ('No Account', 'desk', now());
select is((select count(*)::int from public.notifications where type = 'account_verified'), 1, 'a desk patient without an account notifies nobody');

----------------------------------------------------------------------------
-- Consultation published
----------------------------------------------------------------------------
delete from public.notifications;
update public.consultations set published_at = now() where id = (select c1draft from w);
select is(tests.n((select pat1 from w), 'consultation_published'), 1, 'consultation published: patient notified');
select is(tests.route((select pat1 from w), 'consultation_published'), '/patient/prescriptions', 'consultation published: patient deep link');
select is(tests.n((select c_full from w), 'consultation_published'), 1, 'consultation published: companion with prescriptions + switch notified');
select is(tests.route((select c_full from w), 'consultation_published'), '/companion/' || (select patient1 from w) || '/prescriptions', 'consultation published: companion deep link');
select is(tests.n((select c_rx from w), 'consultation_published'), 0, 'consultation published: prescriptions permission but switch off -> not notified');
select is(tests.n((select doc_a from w), 'consultation_published'), 0, 'consultation published: doctors are not notified');
update public.consultations set advice = 'edited' where id = (select c1draft from w);
select is(tests.n((select pat1 from w), 'consultation_published'), 1, 'consultation published: editing a published one does not notify again');
insert into public.consultations (pregnancy_id, doctor_id, advice) values ((select p1 from w), (select doc_a from w), 'unpublished');
select is(tests.n((select pat1 from w), 'consultation_published'), 1, 'consultation: saving a draft does not notify');

----------------------------------------------------------------------------
-- AI summaries: draft ready -> care team; published -> patient + companions with `summaries`
----------------------------------------------------------------------------
delete from public.notifications;
create temp table s as select gen_random_uuid() as id;
insert into public.ai_summaries (id, pregnancy_id, source_type, status) values ((select id from s), (select p1 from w), 'cumulative', 'generating');
select is((select count(*)::int from public.notifications), 0, 'AI: a row that is still generating notifies nobody');
update public.ai_summaries set status = 'draft', draft = '{"summary":{}}' where id = (select id from s);
select is(tests.n((select doc_a from w), 'ai_draft_ready'), 1, 'AI draft ready: primary doctor notified');
select is(tests.n((select doc_c from w), 'ai_draft_ready'), 1, 'AI draft ready: backup doctor notified');
select is(tests.route((select doc_a from w), 'ai_draft_ready'), '/doctor/ai-inbox/' || (select id from s), 'AI draft ready: deep link');
select is(tests.n((select doc_x from w), 'ai_draft_ready') + tests.n((select doc_b from w), 'ai_draft_ready'), 0, 'AI draft ready: removed / unrelated doctors are not');
select is(tests.n((select pat1 from w), 'ai_draft_ready') + tests.n((select c_full from w), 'ai_draft_ready'), 0, 'AI draft ready: patient and companions never hear about a DRAFT');
select is(tests.n((select pat1 from w), 'summary_published'), 0, 'a draft does not produce summary_published');

delete from public.notifications;
update public.ai_summaries set status = 'published', final = '{"summary":{"headline":"h"}}', reviewed_by = (select doc_a from w), reviewed_at = now(), published_at = now() where id = (select id from s);
select is(tests.n((select pat1 from w), 'summary_published'), 1, 'summary published: patient notified');
select is(tests.route((select pat1 from w), 'summary_published'), '/patient/reports/summaries/' || (select id from s), 'summary published: patient deep link');
select is(tests.n((select c_full from w), 'summary_published'), 1, 'summary published: companion with summaries + switch notified');
select is(tests.route((select c_full from w), 'summary_published'), '/companion/' || (select patient1 from w) || '/summaries', 'summary published: companion deep link');
select is(tests.n((select c_summ from w), 'summary_published'), 0, 'summary published: summaries permission but switch off -> not notified');
select is(tests.n((select doc_a from w), 'summary_published'), 0, 'summary published: the doctor is not notified');

----------------------------------------------------------------------------
-- Report added (first file of a report)
----------------------------------------------------------------------------
delete from public.notifications;
create temp table rp as select gen_random_uuid() as id;
insert into public.reports (id, pregnancy_id, type, uploaded_by) values ((select id from rp), (select p1 from w), 'blood', (select doc_a from w));
select is((select count(*)::int from public.notifications), 0, 'a report without files notifies nobody yet');
insert into public.report_files (report_id, storage_path, mime_type) values ((select id from rp), 'a/b/c/1.pdf', 'application/pdf');
select is(tests.n((select pat1 from w), 'report_added'), 1, 'report added: patient notified');
select is(tests.route((select pat1 from w), 'report_added'), '/patient/reports/' || (select id from rp), 'report added: patient deep link');
select is(tests.n((select c_full from w), 'report_added'), 1, 'report added: companion with reports + switch notified');
select is(tests.route((select c_full from w), 'report_added'), '/companion/' || (select patient1 from w) || '/reports', 'report added: companion deep link');
select is(tests.n((select c_rep from w), 'report_added'), 0, 'report added: reports permission but switch off -> not notified');
insert into public.report_files (report_id, storage_path, mime_type, page_no) values ((select id from rp), 'a/b/c/2.pdf', 'application/pdf', 2);
select is(tests.n((select pat1 from w), 'report_added'), 1, 'report added: further pages do not notify again');

----------------------------------------------------------------------------
-- Companion links
----------------------------------------------------------------------------
delete from public.notifications;
create temp table cl as select gen_random_uuid() as id;
insert into public.companion_links (id, patient_id, companion_user_id, relation, status)
values ((select id from cl), (select patient2 from w), (select c_none from w), 'friend', 'pending');
select is(tests.n((select pat2 from w), 'companion_request'), 1, 'companion request: patient notified');
select is(tests.route((select pat2 from w), 'companion_request'), '/patient/companions', 'companion request: deep link');
select is(tests.n((select c_none from w), 'companion_request'), 0, 'companion request: the requester is not');
update public.companion_links set status = 'approved' where id = (select id from cl);
select is(tests.n((select c_none from w), 'companion_approved'), 1, 'companion approved: companion notified');
select is(tests.route((select c_none from w), 'companion_approved'), '/companion', 'companion approved: deep link');
update public.companion_links set can_view_reports = true where id = (select id from cl);
select is(tests.n((select c_none from w), 'companion_approved'), 1, 'permission edits do not re-notify');
update public.companion_links set status = 'revoked' where id = (select id from cl);
select is(tests.n((select c_none from w), 'companion_revoked'), 1, 'companion revoked: companion notified');
select is(tests.route((select c_none from w), 'companion_revoked'), '/companion', 'companion revoked: deep link');

delete from public.notifications;
create temp table cl2 as select gen_random_uuid() as id;
insert into public.companion_links (id, patient_id, companion_user_id, relation, status)
values ((select id from cl2), (select patient2 from w), (select c_rx from w), 'friend', 'pending');
update public.companion_links set status = 'rejected' where id = (select id from cl2);
select is(tests.n((select c_rx from w), 'companion_revoked'), 1, 'request declined: companion notified');
update public.companion_links set status = 'left' where companion_user_id = (select c_p2 from w);
select is((select count(*)::int from public.notifications where type = 'companion_revoked'), 1, 'a companion leaving does not notify');
delete from public.notifications;
insert into public.companion_links (patient_id, companion_user_id, relation, status)
values ((select patient2 from w), (select c_summ from w), 'friend', 'approved');
select is((select count(*)::int from public.notifications), 0, 'a link created already approved (import) notifies nobody');

----------------------------------------------------------------------------
-- Care team
----------------------------------------------------------------------------
delete from public.notifications;
create temp table ct as select (select id from public.care_team where pregnancy_id = (select p1 from w) and doctor_id = (select doc_c from w)) as cid;
update public.care_team set removed_at = now() where id = (select cid from ct);
select is(tests.n((select doc_c from w), 'care_team_changed'), 1, 'removed from the care team: doctor notified');
select is(tests.route((select doc_c from w), 'care_team_changed'), '/doctor/patients', 'removed: deep link goes to the patient list (the chart is no longer readable)');
delete from public.notifications;
insert into public.care_team (pregnancy_id, doctor_id, care_role) values ((select p1 from w), (select doc_c from w), 'backup');
select is(tests.n((select doc_c from w), 'care_team_changed'), 1, 'added as a backup: doctor notified');
select is(tests.route((select doc_c from w), 'care_team_changed'), '/doctor/patient/' || (select p1 from w), 'added: deep link to the chart');
select is(tests.n((select doc_a from w), 'care_team_changed') + tests.n((select pat1 from w), 'care_team_changed'), 0, 'care team changes notify only the affected doctor');
-- hand over: the old primary becomes backup, the backup becomes primary
delete from public.notifications;
update public.care_team set care_role = 'backup' where pregnancy_id = (select p1 from w) and doctor_id = (select doc_a from w) and removed_at is null;
update public.care_team set care_role = 'primary' where pregnancy_id = (select p1 from w) and doctor_id = (select doc_c from w) and removed_at is null;
select is(tests.n((select doc_a from w), 'care_team_changed'), 1, 'hand over: the old primary is told');
select is(tests.n((select doc_c from w), 'care_team_changed'), 1, 'hand over: the new primary is told');
-- doctor removing himself, and the very first primary of a pregnancy
delete from public.notifications;
select tests.act_as((select doc_a from w));
update public.care_team set removed_at = now() where pregnancy_id = (select p1 from w) and doctor_id = (select doc_a from w) and removed_at is null;
select tests.act_as(null);
select is(tests.n((select doc_a from w), 'care_team_changed'), 0, 'the acting doctor is not notified of his own change');
delete from public.notifications;
create temp table np as select tests.create_pregnancy(null, (select doc_b from w), 8) as id;
select is((select count(*)::int from public.notifications where type = 'care_team_changed'), 0, 'the first primary doctor of a new pregnancy is not announced');

----------------------------------------------------------------------------
-- Push dispatch (pg_net -> send-push)
----------------------------------------------------------------------------
insert into public.push_tokens (user_id, expo_push_token) values ((select pat1 from w), 'ExponentPushToken[dispatch]');
create temp table q as select count(*) as n from net.http_request_queue;
insert into public.notifications (user_id, type, title) values ((select pat1 from w), 'week_update', 'x');
select is((select count(*) from net.http_request_queue), (select n from q), 'no dispatch while the service key is not configured');
select is(private.dispatch_push(gen_random_uuid()), false, 'dispatch_push reports false when unconfigured');

select ok(vault.create_secret('test-service-key-not-real', 'push_service_key') is not null, 'service key stored in Vault');
update q set n = (select count(*) from net.http_request_queue);
create temp table nn as select gen_random_uuid() as id;
insert into public.notifications (id, user_id, type, title) values ((select id from nn), (select pat1 from w), 'week_update', 'x');
select is((select count(*) from net.http_request_queue), (select n + 1 from q), 'a new notification for a user with a token queues one request');
select is((select url from net.http_request_queue order by id desc limit 1), 'http://kong:8000/functions/v1/send-push', 'default local function URL');
select is((select (convert_from(body, 'utf8')::jsonb) ->> 'notification_id' from net.http_request_queue order by id desc limit 1), (select id::text from nn), 'the body carries only the notification id');
select is((select headers ->> 'Authorization' from net.http_request_queue order by id desc limit 1), 'Bearer test-service-key-not-real', 'service key is sent as bearer');
select is((select convert_from(body, 'utf8') from net.http_request_queue order by id desc limit 1) like '%title%', false, 'no title/body/clinical text in the request');

update q set n = (select count(*) from net.http_request_queue);
insert into public.notifications (user_id, type, title) values ((select doc_a from w), 'week_update', 'x');
select is((select count(*) from net.http_request_queue), (select n from q), 'no token, no request');

select ok(vault.create_secret('http://example.invalid/push', 'push_function_url') is not null, 'function URL stored in Vault');
insert into public.notifications (user_id, type, title) values ((select pat1 from w), 'week_update', 'x');
select is((select url from net.http_request_queue order by id desc limit 1), 'http://example.invalid/push', 'function URL can be overridden in Vault');

-- Notification code never blocks the clinical write
set local client_min_messages = error;
create or replace function private.notify_user(p_user uuid, p_type text, p_title text, p_body text, p_data jsonb)
returns uuid language plpgsql as $$ begin raise exception 'boom'; end $$;
select lives_ok($$insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
                  values ((select patient1 from w), (select p1 from w), (select doc_c from w), '2035-01-03 05:00+00', '2035-01-03 05:15+00', 'reception')$$,
                'a failing notification does not roll back the booking');
select is((select count(*)::int from public.appointments where starts_at = '2035-01-03 05:00+00'), 1, 'and the booking is there');

select * from finish();
rollback;
