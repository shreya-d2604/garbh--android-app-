-- Off-care-team appointments (migration 20261030000200): no auto-cancel, reception worklist
-- (appointments_needing_rebook), one "please rebook" notification per appointment, and
-- rebooking with a care-team doctor through reschedule_appointment.
begin;
\ir helpers/setup.psql
\ir helpers/reception.psql
select plan(33);

create temp table u as select
  tests.create_user('h5-admin@t.test', 'admin')        as admin,
  tests.create_user('h5-desk@t.test', 'receptionist')  as desk,
  tests.rc_open_doctor('h5-primary@t.test')            as prim,
  tests.rc_open_doctor('h5-backup@t.test')             as backup,
  tests.rc_open_doctor('h5-leaver@t.test')             as leaver,
  tests.rc_open_doctor('h5-off@t.test')                as off,
  tests.create_user('h5-pat@t.test', 'patient')        as pat,
  tests.create_user('h5-comp@t.test', 'companion')     as comp,
  tests.create_user('h5-comp2@t.test', 'companion')    as comp2;
create temp table fx as select tests.create_pregnancy((select pat from u), (select prim from u), 20) as preg;
create temp table ids as select tests.rc_patient_of((select preg from fx)) as patient;
grant select on u, fx, ids to authenticated;

insert into public.care_team (pregnancy_id, doctor_id, care_role) values
  ((select preg from fx), (select backup from u), 'backup'),
  ((select preg from fx), (select leaver from u), 'backup');
insert into public.companion_links (patient_id, companion_user_id, relation, status, can_view_appointments, receive_notifications)
  values ((select patient from ids), (select comp from u), 'husband', 'approved', true, true),
         ((select patient from ids), (select comp2 from u), 'sibling', 'approved', false, true);

create temp table a as select
  tests.rc_appt((select preg from fx), (select backup from u), tests.rc_in(48))                 as b_future,
  tests.rc_appt((select preg from fx), (select backup from u), tests.rc_in(50))                 as b_future2,
  tests.rc_appt((select preg from fx), (select backup from u), tests.rc_in(52), 'cancelled')    as b_cancelled,
  tests.rc_appt((select preg from fx), (select backup from u), now() - interval '2 days')       as b_past,
  tests.rc_appt((select preg from fx), (select prim from u), tests.rc_in(54))                   as p_future,
  tests.rc_appt((select preg from fx), (select prim from u), tests.rc_in(200))                  as p_timeoff,
  tests.rc_appt((select preg from fx), (select leaver from u), tests.rc_in(56))                 as l_future;
create temp table a_ids as select unnest(array[b_future, b_future2, b_cancelled, b_past, p_future, p_timeoff, l_future]) as id from a;
grant select on a, a_ids to authenticated;
-- The shared DB also holds the demo seed (e.g. Dr. Meera's time off), so worklist counts are
-- scoped to this file's appointments (and the ones rebooking creates).
create temp view mine as select r.* from public.appointments_needing_rebook() r where r.appointment_id in (select id from a_ids);
grant select on mine to authenticated;
insert into public.doctor_time_off (doctor_id, starts_at, ends_at, reason)
  values ((select prim from u), tests.rc_in(199), tests.rc_in(202), 'Conference');

create temp table rebook_ids (id uuid);
grant select, insert, delete on rebook_ids to authenticated;

-- ---------------------------------------------------------------- worklist before any removal
select tests.login_as((select desk from u));
select is((select count(*)::int from mine), 1, 'before removal: only the time-off clash is listed');
select is((select time_off_reason from public.appointments_needing_rebook() where appointment_id = (select p_timeoff from a)),
          'Conference', 'the time-off row carries the window and its reason');
select is((select off_care_team from public.appointments_needing_rebook() where appointment_id = (select p_timeoff from a)),
          false, 'a time-off clash with a care-team doctor is not off-care-team');

-- ---------------------------------------------------------------- primary removes the backup
select tests.login_as((select prim from u));
select lives_ok(format($$ select public.remove_care_team_member(%L, %L) $$, (select preg from fx), (select backup from u)),
                'the primary removes the backup doctor');
select tests.logout();
select is((select status::text from public.appointments where id = (select b_future from a)), 'booked',
          'the removed doctor''s future appointment is NOT cancelled');

select tests.login_as((select desk from u));
select is((select count(*)::int from mine), 3,
          'reception now sees the two future off-care-team appointments and the time-off clash');
select is((select off_care_team from public.appointments_needing_rebook() where appointment_id = (select b_future from a)),
          true, 'the appointment is flagged off_care_team');
select is((select time_off_id from public.appointments_needing_rebook() where appointment_id = (select b_future from a)),
          null, 'with no time-off window');
select is((select count(*)::int from mine
           where appointment_id in ((select b_cancelled from a), (select b_past from a), (select p_future from a))), 0,
          'cancelled, past and care-team appointments are not listed');
select tests.login_as((select admin from u));
select is((select count(*)::int from mine), 3, 'admin sees the same worklist');

-- ---------------------------------------------------------------- denied roles
select tests.login_as((select prim from u));
select throws_ok($$ select * from public.appointments_needing_rebook() $$, 'NOT_ALLOWED', 'a care-team doctor cannot read the worklist');
select tests.login_as((select off from u));
select throws_ok($$ select * from public.appointments_needing_rebook() $$, 'NOT_ALLOWED', 'a doctor not on the care team gets nothing');
select tests.login_as((select pat from u));
select throws_ok($$ select * from public.appointments_needing_rebook() $$, 'NOT_ALLOWED', 'the patient cannot read the worklist');
select tests.login_as((select comp from u));
select throws_ok($$ select * from public.appointments_needing_rebook() $$, 'NOT_ALLOWED', 'a companion cannot read the worklist');
select tests.logout();
select ok(not has_function_privilege('anon', 'public.appointments_needing_rebook()', 'execute'), 'anon cannot execute it');

-- ---------------------------------------------------------------- notifications
select is((select count(*)::int from public.notifications n where n.user_id = (select pat from u)
           and n.type = 'appointment_changed' and n.data ? 'off_care_team'), 2,
          'the patient gets one "please rebook" notice per affected future appointment');
select is((select data ->> 'route' from public.notifications n where n.user_id = (select pat from u)
           and n.data ->> 'appointment_id' = (select b_future from a)::text and n.data ? 'off_care_team'),
          '/patient/appointments/' || (select b_future from a), 'it deep-links to the appointment');
select is((select title from public.notifications n where n.user_id = (select pat from u)
           and n.data ->> 'appointment_id' = (select b_future from a)::text and n.data ? 'off_care_team'),
          'Please rebook your visit', 'with a calm title');
select is((select count(*)::int from public.notifications n where n.user_id = (select comp from u) and n.data ? 'off_care_team'), 2,
          'a companion with appointments + notifications is told too');
select is((select count(*)::int from public.notifications n where n.user_id = (select comp2 from u) and n.data ? 'off_care_team'), 0,
          'a companion without the appointments permission is not');
select is((select count(*)::int from public.notifications n where n.data ->> 'appointment_id' in
             ((select b_cancelled from a)::text, (select b_past from a)::text, (select p_future from a)::text)
           and n.data ? 'off_care_team'), 0, 'no notice for cancelled, past or care-team appointments');

-- idempotent: re-added and removed again (admin path) -> no second notice
select tests.login_as((select prim from u));
select lives_ok(format($$ select public.add_backup_doctor(%L, %L) $$, (select preg from fx), (select backup from u)), 're-added as backup');
select tests.login_as((select desk from u));
select is((select count(*)::int from mine where off_care_team), 0,
          'back on the team: nothing is off-care-team any more');
select tests.login_as((select admin from u));
select lives_ok(format($$ select public.admin_remove_care_team_member(%L, %L) $$, (select preg from fx), (select backup from u)),
                'admin removes the backup again');
select tests.logout();
select is((select count(*)::int from public.notifications n where n.user_id = (select pat from u) and n.data ? 'off_care_team'), 2,
          'removing again does not notify twice for the same appointment');

-- a backup leaving herself
select tests.login_as((select leaver from u));
select lives_ok(format($$ select public.remove_care_team_member(%L, %L) $$, (select preg from fx), (select leaver from u)),
                'a backup leaves the team');
select tests.logout();
select is((select count(*)::int from public.notifications n where n.user_id = (select pat from u)
           and n.data ->> 'appointment_id' = (select l_future from a)::text and n.data ? 'off_care_team'), 1,
          'her patient is asked to rebook that visit');

-- ---------------------------------------------------------------- rebooking
select tests.login_as((select pat from u));
select throws_ok(format($$ select public.reschedule_appointment(%L, %L) $$, (select b_future from a), tests.rc_in(72)),
                 'NOT_ON_CARE_TEAM', 'the patient cannot move it to another time with the removed doctor');
select throws_ok(format($$ select public.reschedule_appointment(%L, %L, %L) $$, (select b_future from a), tests.rc_in(72), (select off from u)),
                 'NOT_ON_CARE_TEAM', 'nor to a doctor who is not on her care team');
select lives_ok(format($$ insert into rebook_ids select public.reschedule_appointment(%L, %L, %L) $$,
                       (select b_future from a), tests.rc_in(72), (select prim from u)),
                'the patient rebooks with her care-team doctor');
select tests.logout();
select ok((select status = 'cancelled' from public.appointments where id = (select b_future from a))
          and (select doctor_id = (select prim from u) and rescheduled_from = (select b_future from a)
               from public.appointments where id = (select id from rebook_ids)),
          'the old appointment is replaced by one with the care-team doctor');

select tests.login_as((select desk from u));
select lives_ok(format($$ select public.reschedule_appointment(%L, %L, %L) $$, (select b_future2 from a), tests.rc_in(96), (select prim from u)),
                'reception rebooks the other one with the primary');
select is((select count(*)::int from mine where off_care_team), 1,
          'only the leaver''s appointment is still waiting');

select * from finish();
rollback;
