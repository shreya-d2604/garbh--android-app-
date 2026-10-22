-- cancel_appointment, reschedule_appointment, set_appointment_status.
begin;
\ir helpers/setup.psql
\ir helpers/reception.psql
select plan(78);

create temp table u as select
  tests.rc_open_doctor('d.open@x.test')            as d_open,    -- primary
  tests.rc_open_doctor('d.back@x.test', false)     as d_back,    -- backup, open round the clock
  tests.rc_open_doctor('d.other@x.test')           as d_other,   -- not on the care team
  tests.create_user('d.part@x.test', 'doctor')     as d_part,    -- backup, Monday 10:00-11:00 only
  tests.create_user('d.off@x.test', 'doctor')      as d_off,     -- on no care team
  tests.create_user('desk@x.test', 'receptionist') as desk,
  tests.create_user('admin@x.test', 'admin')       as admin,
  tests.create_user('p1@x.test', 'patient')        as p1,
  tests.create_user('p2@x.test', 'patient')        as p2,
  tests.create_user('p3@x.test', 'patient')        as p3,
  tests.create_user('comp@x.test', 'companion')    as comp;
create temp table preg as select
  tests.create_pregnancy((select p1 from u), (select d_open from u), 20) as p1,
  tests.create_pregnancy((select p2 from u), (select d_open from u), 20) as p2,
  tests.create_pregnancy((select p3 from u), (select d_open from u), 20) as p3;
insert into public.care_team (pregnancy_id, doctor_id, care_role) values
  ((select p1 from preg), (select d_back from u), 'backup'),
  ((select p1 from preg), (select d_part from u), 'backup');
insert into public.doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes)
values ((select d_part from u), 1, '10:00', '11:00', 15);

create temp table t as select tests.rc_monday() as mon,
  tests.rc_in(60) as r1, tests.rc_in(61) as r2, tests.rc_in(62) as r3, tests.rc_in(63) as r4, tests.rc_in(64) as r5,
  tests.rc_in(73) as r6, tests.rc_in(65) as r7, tests.rc_in(0.5) as soon, tests.rc_in(61 * 24) as far, tests.rc_in(100 * 24) as st_adv;
-- p1 with d_open unless noted; cut = inside the 4h cutoff, edge = exactly 4h away
create temp table ap as select
  tests.rc_appt((select p1 from preg), (select d_open from u), tests.rc_in(3))                    as cut,
  tests.rc_appt((select p1 from preg), (select d_open from u), now() + interval '4 hours')         as edge,
  tests.rc_appt((select p1 from preg), (select d_open from u), tests.rc_in(30))                   as far1,
  tests.rc_appt((select p1 from preg), (select d_open from u), tests.rc_in(33))                   as far2,
  tests.rc_appt((select p1 from preg), (select d_open from u), tests.rc_in(36))                   as far3,
  tests.rc_appt((select p1 from preg), (select d_open from u), tests.rc_in(39))                   as far4,
  tests.rc_appt((select p1 from preg), (select d_open from u), tests.rc_in(42))                   as far5,
  tests.rc_appt((select p1 from preg), (select d_open from u), tests.rc_in(45), 'checked_in')     as checked,
  tests.rc_appt((select p1 from preg), (select d_open from u), tests.rc_in(48), 'cancelled')      as cancelled,
  tests.rc_appt((select p1 from preg), (select d_open from u), tests.rc_in(54))                   as p1_b,
  tests.rc_appt((select p2 from preg), (select d_open from u), tests.rc_in(51))                   as p2_a,
  tests.rc_appt((select p3 from preg), (select d_open from u), tests.rc_in(70))                   as p3_a,
  tests.rc_appt((select p3 from preg), (select d_open from u), tests.rc_in(71))                   as p3_b,
  tests.rc_appt((select p3 from preg), (select d_open from u), tests.rc_in(72))                   as p3_c;
update public.appointments set reason = 'Routine' where id = (select far2 from ap);
-- visit links: far1 <-> seq 5, far2 <-> seq 6
create temp table vis as select
  (select id from public.visits where pregnancy_id = (select p1 from preg) and seq = 5) as v5,
  (select id from public.visits where pregnancy_id = (select p1 from preg) and seq = 6) as v6;
update public.visits set status = 'scheduled', appointment_id = (select far1 from ap) where id = (select v5 from vis);
update public.appointments set visit_id = (select v5 from vis) where id = (select far1 from ap);
update public.visits set status = 'scheduled', appointment_id = (select far2 from ap) where id = (select v6 from vis);
update public.appointments set visit_id = (select v6 from vis) where id = (select far2 from ap);
grant select on u, preg, t, ap, vis to authenticated;

-- ================================================================= cancel_appointment
select tests.login_as((select p1 from u));
select lives_ok($$ select public.cancel_appointment((select far1 from ap), 'Not needed') $$, 'patient cancels her appointment outside the cutoff');
select throws_ok($$ select public.cancel_appointment((select cut from ap), 'x') $$, 'CANCEL_CUTOFF', 'patient: inside the cutoff');
select lives_ok($$ select public.cancel_appointment((select edge from ap), null) $$, 'patient: exactly at the cutoff is still allowed');
select throws_ok($$ select public.cancel_appointment((select far1 from ap), 'again') $$, 'INVALID_STATUS_CHANGE', 'already cancelled');
select throws_ok($$ select public.cancel_appointment((select checked from ap), 'x') $$, 'INVALID_STATUS_CHANGE', 'a checked-in appointment cannot be cancelled');
select throws_ok($$ select public.cancel_appointment(gen_random_uuid(), 'x') $$, 'NOT_FOUND', 'unknown appointment');
select tests.logout();
select is((select status::text || '|' || cancelled_by::text || '|' || cancelled_reason from public.appointments where id = (select far1 from ap)),
  'cancelled|' || (select p1 from u)::text || '|Not needed', 'status, cancelled_by and reason are stored');
select is((select status::text || '|' || coalesce(appointment_id::text, 'none') from public.visits where id = (select v5 from vis)),
  'planned|none', 'the linked visit goes back to planned');
select is((select status::text from public.appointments where id = (select cut from ap)), 'booked', 'a rejected cancel changes nothing');

select tests.login_as((select p2 from u));
select throws_ok($$ select public.cancel_appointment((select far2 from ap), 'x') $$, 'NOT_ALLOWED', 'another patient''s appointment');
select tests.login_as((select comp from u));
select throws_ok($$ select public.cancel_appointment((select far2 from ap), 'x') $$, 'NOT_ALLOWED', 'companions cannot cancel');
select tests.logout();
select throws_ok($$ select public.cancel_appointment((select far2 from ap), 'x') $$, 'NOT_AUTHENTICATED', 'no session');
select set_config('role', 'anon', true);
select throws_ok($$ select public.cancel_appointment(gen_random_uuid(), 'x') $$, '42501', null, 'anon cannot execute cancel_appointment');
select tests.logout();

-- ================================================================= reschedule_appointment (patient)
select tests.login_as((select p1 from u));
select lives_ok($$ select public.reschedule_appointment((select far2 from ap), (select r1 from t)) $$, 'patient reschedules to a free slot, same doctor');
select tests.logout();
select is((select status::text || '|' || cancelled_reason from public.appointments where id = (select far2 from ap)), 'cancelled|rescheduled', 'the old appointment is cancelled');
select is((select count(*)::int from public.appointments where rescheduled_from = (select far2 from ap) and starts_at = (select r1 from t)
           and status = 'booked' and booking_channel = 'app' and doctor_id = (select d_open from u) and reason = 'Routine'), 1,
  'the new appointment links back, keeps doctor and reason, channel app');
select is((select appointment_id from public.visits where id = (select v6 from vis)),
  (select id from public.appointments where rescheduled_from = (select far2 from ap)), 'the visit link moves to the new appointment');
select is((select status::text from public.visits where id = (select v6 from vis)), 'scheduled', 'the visit stays scheduled');

select tests.login_as((select p1 from u));
select throws_ok($$ select public.reschedule_appointment((select cut from ap), (select r2 from t)) $$, 'CANCEL_CUTOFF', 'patient: cutoff applies to the OLD start');
select throws_ok($$ select public.reschedule_appointment((select far3 from ap), tests.rc_in(51)) $$,
  'SLOT_TAKEN', 'rescheduling onto a taken slot fails');
select throws_ok($$ select public.reschedule_appointment((select far3 from ap), tests.rc_at((select mon from t), '12:00'), (select d_part from u)) $$,
  'OUTSIDE_AVAILABILITY', 'rescheduling outside the weekly hours fails');
select throws_ok($$ select public.reschedule_appointment((select far3 from ap), (select r2 from t), (select d_other from u)) $$,
  'NOT_ON_CARE_TEAM', 'rescheduling to a doctor outside the care team fails');
select throws_ok($$ select public.reschedule_appointment((select far3 from ap), (select soon from t)) $$, 'TOO_SOON', 'rescheduling inside the lead time fails');
select throws_ok($$ select public.reschedule_appointment((select far3 from ap), (select far from t)) $$, 'TOO_FAR_AHEAD', 'rescheduling beyond the advance window fails');
select throws_ok($$ select public.reschedule_appointment((select far3 from ap), tests.rc_in(36)) $$,
  'INVALID_INPUT', 'same doctor and same time is not a reschedule');
select throws_ok($$ select public.reschedule_appointment((select far1 from ap), (select r2 from t)) $$, 'INVALID_STATUS_CHANGE', 'a cancelled appointment cannot be rescheduled');
select throws_ok($$ select public.reschedule_appointment(gen_random_uuid(), (select r2 from t)) $$, 'NOT_FOUND', 'unknown appointment');
select throws_ok($$ select public.reschedule_appointment((select far3 from ap), null) $$, 'INVALID_INPUT', 'a new start time is required');
select tests.logout();
select is((select count(*)::int from public.appointments where id = (select far3 from ap) and status = 'booked' and doctor_id = (select d_open from u)
           and starts_at = tests.rc_in(36)), 1, 'every failed reschedule leaves the old appointment untouched (atomic)');
select is((select count(*)::int from public.appointments where rescheduled_from = (select far3 from ap)), 0, 'and creates no new row');

select tests.login_as((select p1 from u));
select lives_ok($$ select public.reschedule_appointment((select far3 from ap), (select r2 from t), (select d_back from u)) $$,
  'patient moves to a backup doctor on her care team');
select tests.login_as((select p2 from u));
select throws_ok($$ select public.reschedule_appointment((select far4 from ap), (select r3 from t)) $$, 'NOT_ALLOWED', 'another patient''s appointment');
select tests.login_as((select p3 from u));
select lives_ok($$ select public.reschedule_appointment((select p3_a from ap), (select r6 from t)) $$,
  'rescheduling is never blocked by the max-upcoming limit');
select tests.login_as((select comp from u));
select throws_ok($$ select public.reschedule_appointment((select far4 from ap), (select r3 from t)) $$, 'NOT_ALLOWED', 'companions cannot reschedule');
select tests.logout();
select is((select doctor_id from public.appointments where rescheduled_from = (select far3 from ap)), (select d_back from u), 'the new appointment is with the backup doctor');

-- ================================================================= staff: cutoff bypass, advance bypass
select tests.login_as((select desk from u));
select lives_ok($$ select public.reschedule_appointment((select cut from ap), (select r3 from t)) $$, 'reception reschedules inside the cutoff');
select lives_ok($$ select public.reschedule_appointment((select far4 from ap), (select st_adv from t)) $$, 'reception reschedules beyond the advance window');
select tests.logout();
select is((select booking_channel::text from public.appointments where rescheduled_from = (select cut from ap)), 'reception', 'staff reschedules carry their own channel');

select tests.login_as((select d_open from u));
select lives_ok($$ select public.reschedule_appointment((select far5 from ap), (select r4 from t), (select d_back from u)) $$, 'a care-team doctor moves a patient to a backup doctor');
select tests.login_as((select d_off from u));
select throws_ok($$ select public.reschedule_appointment((select p2_a from ap), (select r5 from t)) $$, 'NOT_ALLOWED', 'a doctor outside the care team cannot reschedule');
select throws_ok($$ select public.cancel_appointment((select p2_a from ap), 'x') $$, 'NOT_ALLOWED', 'a doctor outside the care team cannot cancel');

select tests.login_as((select desk from u));
select lives_ok($$ select public.cancel_appointment((select p2_a from ap), 'Patient called') $$, 'reception cancels (no cutoff for staff)');
select tests.login_as((select d_back from u));
select lives_ok($$ select public.cancel_appointment((select p1_b from ap), 'Doctor on leave') $$, 'a backup doctor on the care team can cancel');
select tests.logout();

-- ================================================================= set_appointment_status
create temp table st as select
  tests.rc_appt((select p2 from preg), (select d_open from u), tests.rc_in(80))  as s1,
  tests.rc_appt((select p2 from preg), (select d_open from u), tests.rc_in(81))  as s2,
  tests.rc_appt((select p2 from preg), (select d_open from u), tests.rc_in(82))  as s3,
  tests.rc_appt((select p2 from preg), (select d_open from u), tests.rc_in(83))  as s4,
  tests.rc_appt((select p2 from preg), (select d_open from u), tests.rc_in(84))  as s5,
  tests.rc_appt((select p2 from preg), (select d_open from u), tests.rc_in(85))  as s6,
  tests.rc_appt((select p2 from preg), (select d_open from u), tests.rc_in(86))  as s7,
  tests.rc_appt((select p2 from preg), (select d_open from u), tests.rc_in(87), 'completed') as done;
grant select on st to authenticated;
-- s3 is linked to a visit
update public.visits set status = 'scheduled', appointment_id = (select s3 from st)
 where id = (select id from public.visits where pregnancy_id = (select p2 from preg) and seq = 4);
update public.appointments set visit_id = (select id from public.visits where pregnancy_id = (select p2 from preg) and seq = 4) where id = (select s3 from st);
-- s6 is linked to a visit that the doctor will complete
update public.visits set status = 'scheduled', appointment_id = (select s6 from st)
 where id = (select id from public.visits where pregnancy_id = (select p2 from preg) and seq = 8);
update public.appointments set visit_id = (select id from public.visits where pregnancy_id = (select p2 from preg) and seq = 8) where id = (select s6 from st);

select tests.login_as((select desk from u));
select lives_ok($$ select public.set_appointment_status((select s1 from st), 'checked_in') $$, 'reception: booked -> checked_in');
select lives_ok($$ select public.set_appointment_status((select s2 from st), 'confirmed') $$, 'reception: booked -> confirmed');
select lives_ok($$ select public.set_appointment_status((select s2 from st), 'checked_in') $$, 'reception: confirmed -> checked_in');
select lives_ok($$ select public.set_appointment_status((select s3 from st), 'no_show') $$, 'reception: booked -> no_show');
select lives_ok($$ select public.set_appointment_status((select s4 from st), 'confirmed') $$, 'reception: booked -> confirmed (again, for no_show)');
select lives_ok($$ select public.set_appointment_status((select s4 from st), 'no_show') $$, 'reception: confirmed -> no_show');
select throws_ok($$ select public.set_appointment_status((select s1 from st), 'no_show') $$, 'INVALID_STATUS_CHANGE', 'checked_in -> no_show is not allowed');
select throws_ok($$ select public.set_appointment_status((select s1 from st), 'checked_in') $$, 'INVALID_STATUS_CHANGE', 'checked_in -> checked_in');
select throws_ok($$ select public.set_appointment_status((select done from st), 'checked_in') $$, 'INVALID_STATUS_CHANGE', 'completed -> checked_in');
select throws_ok($$ select public.set_appointment_status((select s5 from st), 'in_consultation') $$, 'INVALID_STATUS_CHANGE', 'reception cannot start a consultation');
select throws_ok($$ select public.set_appointment_status((select s5 from st), 'completed') $$, 'INVALID_STATUS_CHANGE', 'reception cannot complete');
select throws_ok($$ select public.set_appointment_status((select s5 from st), 'cancelled') $$, 'INVALID_STATUS_CHANGE', 'cancelling goes through cancel_appointment');
select throws_ok($$ select public.set_appointment_status((select s5 from st), 'booked') $$, 'INVALID_STATUS_CHANGE', 'booked -> booked');
select throws_ok($$ select public.set_appointment_status((select s3 from st), 'confirmed') $$, 'INVALID_STATUS_CHANGE', 'no_show -> confirmed');
select throws_ok($$ select public.set_appointment_status(gen_random_uuid(), 'confirmed') $$, 'NOT_FOUND', 'unknown appointment');
select tests.logout();
select ok((select checked_in_at is not null from public.appointments where id = (select s1 from st)), 'checking in stamps checked_in_at');
select is((select status::text || '|' || coalesce(appointment_id::text, 'none') from public.visits where id = (select visit_id from public.appointments where id = (select s3 from st))),
  'planned|none', 'a no-show puts the linked visit back on the worklist');
select lives_ok($$ select tests.rc_appt((select p3 from preg), (select d_open from u), tests.rc_in(82)) $$,
  'a no-show frees the slot for the exclusion constraint');

select tests.login_as((select p2 from u));
select throws_ok($$ select public.set_appointment_status((select s5 from st), 'checked_in') $$, 'NOT_ALLOWED', 'patients cannot change status');
select tests.login_as((select comp from u));
select throws_ok($$ select public.set_appointment_status((select s5 from st), 'checked_in') $$, 'NOT_ALLOWED', 'companions cannot change status');
select tests.logout();
select throws_ok($$ select public.set_appointment_status((select s5 from st), 'checked_in') $$, 'NOT_AUTHENTICATED', 'no session');
select set_config('role', 'anon', true);
select throws_ok($$ select public.set_appointment_status(gen_random_uuid(), 'confirmed') $$, '42501', null, 'anon cannot execute set_appointment_status');
select tests.logout();

select tests.login_as((select d_open from u));
select lives_ok($$ select public.set_appointment_status((select s1 from st), 'in_consultation') $$, 'doctor: checked_in -> in_consultation');
select lives_ok($$ select public.set_appointment_status((select s5 from st), 'in_consultation') $$, 'doctor: booked -> in_consultation');
select lives_ok($$ select public.set_appointment_status((select s1 from st), 'completed') $$, 'doctor: in_consultation -> completed');
select throws_ok($$ select public.set_appointment_status((select s6 from st), 'checked_in') $$, 'INVALID_STATUS_CHANGE', 'doctor cannot check patients in');
select throws_ok($$ select public.set_appointment_status((select s6 from st), 'no_show') $$, 'INVALID_STATUS_CHANGE', 'doctor cannot mark no-show');
select throws_ok($$ select public.set_appointment_status((select s6 from st), 'completed') $$, 'INVALID_STATUS_CHANGE', 'booked -> completed skips the consultation');
select throws_ok($$ select public.set_appointment_status((select s1 from st), 'in_consultation') $$, 'INVALID_STATUS_CHANGE', 'completed -> in_consultation');
select tests.login_as((select d_back from u));
-- d_back is on P1's team only, not P2's
select throws_ok($$ select public.set_appointment_status((select s6 from st), 'in_consultation') $$, 'NOT_ALLOWED', 'a doctor outside the care team cannot touch the appointment');
select tests.login_as((select d_open from u));
select lives_ok($$ select public.set_appointment_status((select s6 from st), 'in_consultation') $$, 'doctor: start consultation on the linked-visit appointment');
select lives_ok($$ select public.set_appointment_status((select s6 from st), 'completed') $$, 'doctor: complete');
select tests.logout();
select is((select status::text from public.visits where appointment_id = (select s6 from st)), 'completed', 'completing marks the linked visit completed');

select tests.login_as((select admin from u));
select lives_ok($$ select public.set_appointment_status((select s7 from st), 'checked_in') $$, 'admin: reception transition');
select lives_ok($$ select public.set_appointment_status((select s7 from st), 'in_consultation') $$, 'admin: doctor transition');
select tests.logout();

select * from finish();
rollback;
