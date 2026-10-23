-- Scheduled jobs (PLAN.md §8.6). The bodies are private functions, called directly here.
begin;
\ir helpers/setup.psql
\ir helpers/backend.psql
select no_plan();
select tests.build_world();
update public.companion_links set receive_notifications = true where companion_user_id = (select c_jour from w);

create function tests.n(p_uid uuid, p_type text) returns int language sql as
  $$ select count(*)::int from public.notifications where user_id = p_uid and type = p_type $$;
create function tests.route(p_uid uuid, p_type text) returns text language sql as
  $$ select data ->> 'route' from public.notifications where user_id = p_uid and type = p_type order by created_at desc, id limit 1 $$;

----------------------------------------------------------------------------
-- Schedules exist, in UTC, for the IST times of the plan
----------------------------------------------------------------------------
select is((select count(*)::int from cron.job where jobname like 'garbh-%'), 7, 'seven GARBH jobs are scheduled');
select is((select schedule from cron.job where jobname = 'garbh-reminders-24h'), '*/15 * * * *', '24h reminders run every 15 minutes');
select is((select schedule from cron.job where jobname = 'garbh-reminders-2h'), '*/15 * * * *', '2h reminders run every 15 minutes');
select is((select schedule from cron.job where jobname = 'garbh-visit-due'), '30 3 * * *', 'visit due: 09:00 IST');
select is((select schedule from cron.job where jobname = 'garbh-missed-visits'), '30 17 * * *', 'missed visits: 23:00 IST');
select is((select schedule from cron.job where jobname = 'garbh-week-updates'), '30 2 * * *', 'week updates: 08:00 IST');
select is((select schedule from cron.job where jobname = 'garbh-expire-invites'), '5 * * * *', 'invite expiry: hourly');
select is((select schedule from cron.job where jobname = 'garbh-data-quality'), '30 4 * * *', 'data quality: daily');
select is((select count(*)::int from cron.job where jobname like 'garbh-%' and command !~ '^select private\.job_[a-z0-9_]+\(\)$'), 0, 'every job calls a private job function');
select is(has_schema_privilege('authenticated', 'private', 'usage'), false, 'clients cannot reach the job functions');

----------------------------------------------------------------------------
-- Reminders: the 15 minutes before 24h / 2h, once
----------------------------------------------------------------------------
delete from public.notifications;
create temp table a as select
  gen_random_uuid() as h24, gen_random_uuid() as h24_early, gen_random_uuid() as h24_late, gen_random_uuid() as h2,
  gen_random_uuid() as h24_cancelled, gen_random_uuid() as done;
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, status, booking_channel) values
  ((select h24 from a),          (select patient1 from w), (select p1 from w), (select doc_a from w), now() + interval '23 hours 50 minutes', now() + interval '24 hours 5 minutes', 'booked', 'reception'),
  ((select h24_early from a),    (select patient1 from w), (select p1 from w), (select doc_a from w), now() + interval '26 hours', now() + interval '26 hours 15 minutes', 'booked', 'reception'),
  ((select h24_late from a),     (select patient1 from w), (select p1 from w), (select doc_a from w), now() + interval '23 hours 30 minutes', now() + interval '23 hours 45 minutes', 'booked', 'reception'),
  ((select h2 from a),           (select patient1 from w), (select p1 from w), (select doc_a from w), now() + interval '1 hour 50 minutes', now() + interval '2 hours 5 minutes', 'confirmed', 'reception'),
  ((select h24_cancelled from a),(select patient1 from w), (select p1 from w), (select doc_a from w), now() + interval '23 hours 55 minutes', now() + interval '24 hours 10 minutes', 'cancelled', 'reception'),
  ((select done from a),         (select patient1 from w), (select p1 from w), (select doc_a from w), now() + interval '2 hours 10 minutes', now() + interval '2 hours 25 minutes', 'completed', 'reception');
delete from public.notifications;

select cmp_ok(private.job_reminders_24h(), '>=', 1, '24h job reminds the appointment in the window (and any seeded one)');
select is(tests.n((select pat1 from w), 'appointment_reminder'), 1, 'patient reminded');
select is(tests.route((select pat1 from w), 'appointment_reminder'), '/patient/appointments/' || (select h24 from a), 'reminder deep link');
select is(tests.n((select c_full from w), 'appointment_reminder'), 1, 'companion with permission + switch reminded');
select is(tests.route((select c_full from w), 'appointment_reminder'), '/companion/' || (select patient1 from w) || '/appointments', 'companion reminder deep link');
select is(tests.n((select c_appt from w), 'appointment_reminder') + tests.n((select c_jour from w), 'appointment_reminder') + tests.n((select c_rev from w), 'appointment_reminder'), 0, 'companions without the permission or the switch are not reminded');
select is(tests.n((select doc_a from w), 'appointment_reminder'), 0, 'doctors are not reminded');
select ok((select reminder_24h_sent_at is not null from public.appointments where id = (select h24 from a)), 'reminder_24h_sent_at stamped');
select ok((select reminder_24h_sent_at is null from public.appointments where id = (select h24_early from a)), 'too early: not stamped');
select ok((select reminder_24h_sent_at is null from public.appointments where id = (select h24_late from a)), 'already inside 23h45m: not stamped');
select ok((select reminder_24h_sent_at is null from public.appointments where id = (select h24_cancelled from a)), 'cancelled: not stamped');
select is(private.job_reminders_24h(), 0, 'a second run does nothing');
select is(tests.n((select pat1 from w), 'appointment_reminder'), 1, 'no duplicate reminder');

select cmp_ok(private.job_reminders_2h(), '>=', 1, '2h job reminds the appointment in the window (and any seeded one)');
select is(tests.n((select pat1 from w), 'appointment_reminder'), 2, 'patient got the 2h reminder as well');
select ok((select reminder_2h_sent_at is not null and reminder_24h_sent_at is null from public.appointments where id = (select h2 from a)), 'reminder_2h_sent_at stamped, 24h untouched');
select is(private.job_reminders_2h(), 0, 'second 2h run does nothing');

----------------------------------------------------------------------------
-- Visit due (window opens within 7 days), once per visit
----------------------------------------------------------------------------
delete from public.notifications;
delete from public.visits where pregnancy_id in ((select p1 from w), (select p2 from w));
create temp table v as select gen_random_uuid() as soon, gen_random_uuid() as later, gen_random_uuid() as booked, gen_random_uuid() as past, gen_random_uuid() as open_now, gen_random_uuid() as p2v;
insert into public.visits (id, pregnancy_id, seq, target_week, due_from, due_to, title, status, appointment_id) values
  ((select soon from v),    (select p1 from w), 1, 24, public.hospital_today() + 5,  public.hospital_today() + 20, 'Soon', 'planned', null),
  ((select later from v),   (select p1 from w), 2, 28, public.hospital_today() + 9,  public.hospital_today() + 30, 'Later', 'planned', null),
  ((select booked from v),  (select p1 from w), 3, 30, public.hospital_today() + 3,  public.hospital_today() + 15, 'Booked', 'planned', (select h24 from a)),
  ((select past from v),    (select p1 from w), 4, 20, public.hospital_today() - 30, public.hospital_today() - 10, 'Past', 'planned', null),
  ((select open_now from v),(select p1 from w), 5, 22, public.hospital_today() - 2,  public.hospital_today() + 12, 'Open', 'planned', null),
  ((select p2v from v),     (select p2 from w), 1, 12, public.hospital_today() + 1,  public.hospital_today() + 10, 'P2', 'planned', null);
select cmp_ok(private.job_visit_due(), '>=', 3, 'visit due: window opens within 7 days or is open now, unbooked (plus seeded patients)');
select is(tests.n((select pat1 from w), 'visit_due'), 2, 'patient 1 notified for two visits');
select is(tests.n((select pat2 from w), 'visit_due'), 1, 'patient 2 notified for hers');
select is((select count(*)::int from public.notifications where type = 'visit_due' and data ->> 'visit_id' = (select later from v)::text), 0, 'a window opening in more than 7 days waits');
select is((select count(*)::int from public.notifications where type = 'visit_due' and data ->> 'visit_id' in ((select booked from v)::text, (select past from v)::text)), 0, 'booked and past-window visits are skipped');
select is((select data ->> 'route' from public.notifications where type = 'visit_due' and data ->> 'visit_id' = (select soon from v)::text), '/patient/appointments/book?visit=' || (select soon from v), '"Book now" deep link');
select is(tests.n((select c_full from w), 'visit_due'), 0, 'companions are not nudged to book');
select is(private.job_visit_due(), 0, 'each visit is announced once');
-- a patient without an account
update public.patients set user_id = null where id = (select patient2 from w);
update public.visits set due_from = public.hospital_today() + 2 where id = (select p2v from v);
delete from public.notifications;
create temp table vd_run as select private.job_visit_due() as n;
select is(tests.n((select pat2 from w), 'visit_due'), 0, 'a patient without an account cannot be notified');

----------------------------------------------------------------------------
-- Missed visits
----------------------------------------------------------------------------
delete from public.notifications;
delete from public.visits where pregnancy_id in ((select p1 from w), (select p2 from w));
insert into public.visits (id, pregnancy_id, seq, target_week, due_from, due_to, title, status, appointment_id) values
  ((select past from v),    (select p1 from w), 1, 20, public.hospital_today() - 30, public.hospital_today() - 3, 'Just missed', 'planned', null),
  ((select later from v),   (select p1 from w), 2, 16, public.hospital_today() - 60, public.hospital_today() - 40, 'Long ago', 'planned', null),
  ((select soon from v),    (select p1 from w), 3, 24, public.hospital_today() - 2,  public.hospital_today() + 10, 'Open', 'planned', null),
  ((select booked from v),  (select p1 from w), 4, 18, public.hospital_today() - 30, public.hospital_today() - 10, 'Has appointment', 'scheduled', (select h24 from a)),
  ((select open_now from v),(select p1 from w), 5, 12, public.hospital_today() - 70, public.hospital_today() - 50, 'Done', 'completed', null);
select cmp_ok(private.job_missed_visits(), '>=', 2, 'planned unbooked visits past their window are marked');
select is((select status::text from public.visits where id = (select past from v)), 'missed', 'past window -> missed');
select is((select status::text from public.visits where id = (select later from v)), 'missed', 'long past -> missed');
select is((select status::text from public.visits where id = (select soon from v)), 'planned', 'open window untouched');
select is((select status::text from public.visits where id = (select booked from v)), 'scheduled', 'scheduled visits untouched');
select is((select status::text from public.visits where id = (select open_now from v)), 'completed', 'completed visits untouched');
select is(tests.n((select pat1 from w), 'visit_due'), 1, 'only the recently missed visit is nudged (no flood)');
select is(tests.route((select pat1 from w), 'visit_due'), '/patient/appointments/book?visit=' || (select past from v), 'deep link to rebook');
select is(private.job_missed_visits(), 0, 'second run does nothing');

----------------------------------------------------------------------------
-- Week milestone / trimester change
----------------------------------------------------------------------------
delete from public.notifications;
update public.patients set user_id = (select pat2 from w) where id = (select patient2 from w);
-- P1 is exactly 20w0d, P2 exactly 12w0d today
select cmp_ok(private.job_week_updates(), '>=', 2, 'both pregnancies start a new week today (plus seeded ones)');
select is(tests.n((select pat1 from w), 'week_update'), 1, 'patient 1: week update');
select is((select data ->> 'week' from public.notifications where user_id = (select pat1 from w) and type = 'week_update'), '20', 'with the week number');
select is(tests.route((select pat1 from w), 'week_update'), '/patient/journey', 'patient deep link');
select is(tests.n((select c_full from w), 'week_update'), 1, 'companion with journey + switch');
select is(tests.route((select c_full from w), 'week_update'), '/companion/' || (select patient1 from w) || '/journey', 'companion deep link');
select is(tests.n((select c_jour from w), 'week_update'), 1, 'companion with journey and the switch on');
select is(tests.n((select c_none from w), 'week_update') + tests.n((select c_appt from w), 'week_update'), 0, 'companions without journey are not');
select is(private.job_week_updates(), 0, 'once per week');
-- trimester boundaries
update public.pregnancies set lmp_date = public.hospital_today() - 14 * 7 where id = (select p1 from w);
update public.pregnancies set lmp_date = public.hospital_today() - (28 * 7 + 1) where id = (select p2 from w);
select cmp_ok(private.job_week_updates(), '>=', 2, 'a day or so into a new week still counts (job tolerance)');
select is(tests.n((select pat1 from w), 'trimester_change'), 1, '14w0d: trimester change (second)');
select is(tests.n((select pat2 from w), 'trimester_change'), 1, '28w1d: trimester change (third)');
select is((select title from public.notifications where user_id = (select pat1 from w) and type = 'trimester_change'), 'Trimester 2 begins', 'title names the trimester');
-- mid-week and inactive pregnancies
delete from public.notifications;
update public.pregnancies set lmp_date = public.hospital_today() - (21 * 7 + 3) where id = (select p1 from w);
update public.pregnancies set status = 'delivered' where id = (select p2 from w);
create temp table wk_run as select private.job_week_updates() as n;
select is(tests.n((select pat1 from w), 'week_update') + tests.n((select pat1 from w), 'trimester_change') + tests.n((select pat2 from w), 'week_update') + tests.n((select pat2 from w), 'trimester_change'), 0, 'mid-week: nothing; delivered pregnancy: nothing');

----------------------------------------------------------------------------
-- Companion invites
----------------------------------------------------------------------------
delete from public.companion_invites;
insert into public.companion_invites (patient_id, code_hash, expires_at, used_at, revoked_at) values
  ((select patient1 from w), 'h-expired',   now() - interval '1 hour', null, null),
  ((select patient1 from w), 'h-expired-2', now() - interval '3 days', null, null),
  ((select patient1 from w), 'h-active',    now() + interval '5 hours', null, null),
  ((select patient1 from w), 'h-used',      now() - interval '1 hour', now() - interval '2 hours', null),
  ((select patient1 from w), 'h-revoked',   now() - interval '1 hour', null, now() - interval '3 hours');
select cmp_ok(private.job_expire_invites(), '>=', 2, 'unused expired codes are revoked');
select is((select count(*)::int from public.companion_invites where revoked_at is not null), 3, 'three are revoked now (one was before)');
select ok((select revoked_at is null from public.companion_invites where code_hash = 'h-active'), 'an active code is untouched');
select ok((select revoked_at is null and used_at is not null from public.companion_invites where code_hash = 'h-used'), 'a used code is not touched');
select ok((select revoked_at < now() - interval '2 hours' from public.companion_invites where code_hash = 'h-revoked'), 'an already revoked code keeps its timestamp');
select is(private.job_expire_invites(), 0, 'idempotent');

----------------------------------------------------------------------------
-- Data-quality nudges
----------------------------------------------------------------------------
delete from public.notifications;
update public.pregnancies set status = 'active' where id = (select p2 from w);
insert into public.ai_summaries (pregnancy_id, source_type, status, generated_at, draft) values
  ((select p1 from w), 'cumulative', 'draft', now() - interval '30 hours', '{"summary":{}}');
insert into public.lab_results (pregnancy_id, test_code, value_num, source, verified, created_at) values
  ((select p1 from w), 'HB', 10, 'ai_extracted', false, now() - interval '50 hours');
select ok(private.job_data_quality() >= 3, 'doctors on the care team and admins are nudged');
select is(tests.n((select doc_a from w), 'data_quality'), 1, 'primary doctor nudged');
select is(tests.n((select doc_c from w), 'data_quality'), 1, 'backup doctor nudged');
select is(tests.route((select doc_a from w), 'data_quality'), '/doctor/patients', 'doctor deep link');
select is(tests.n((select admin from w), 'data_quality'), 1, 'admin nudged');
select is(tests.route((select admin from w), 'data_quality'), '/admin/data-quality', 'admin deep link');
select is(tests.n((select doc_b from w), 'data_quality') + tests.n((select doc_x from w), 'data_quality'), 0, 'doctors with nothing stale (or no longer on the team) are not');
select is(tests.n((select pat1 from w), 'data_quality') + tests.n((select desk from w), 'data_quality') + tests.n((select c_full from w), 'data_quality'), 0, 'patients, companions and reception are not');
select is(private.job_data_quality(), 0, 'at most one nudge per person per day');
select is((select data ->> 'ai_drafts' from public.notifications where user_id = (select doc_a from w) and type = 'data_quality'), '1', 'the nudge counts the stale drafts');
select * from finish();
rollback;
