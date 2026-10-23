-- book_appointment: every rejection (patient path), the first-visit rule, staff bypasses, linking.
begin;
\ir helpers/setup.psql
\ir helpers/reception.psql
select plan(65);

create temp table u as select
  tests.rc_open_doctor('d.open@x.test')            as d_open,    -- accepting; P1/P2's primary
  tests.rc_open_doctor('d.back@x.test', false)     as d_back,    -- P1's backup
  tests.rc_open_doctor('d.other@x.test')           as d_other,   -- accepting, NOT on P1's team
  tests.rc_open_doctor('d.noacc@x.test', false)    as d_noacc,   -- not accepting, on no team
  tests.create_user('d.part@x.test', 'doctor')     as d_part,    -- Monday 10:00-11:00 only; P1's backup
  tests.create_user('desk@x.test', 'receptionist') as desk,
  tests.create_user('admin@x.test', 'admin')       as admin,
  tests.create_user('p1@x.test', 'patient')        as p1,        -- verified
  tests.create_user('p2@x.test', 'patient')        as p2,        -- verified
  tests.create_user('u1@x.test', 'patient')        as u1,        -- unverified, first booking
  tests.create_user('u2@x.test', 'patient')        as u2,        -- unverified, doctor not accepting
  tests.create_user('u3@x.test', 'patient')        as u3,        -- unverified, booked by the desk
  tests.create_user('comp@x.test', 'companion')    as comp;
create temp table preg as select
  tests.create_pregnancy((select p1 from u), (select d_open from u), 20) as p1,
  tests.create_pregnancy((select p2 from u), (select d_open from u), 20) as p2,
  tests.rc_app_patient((select u1 from u), 'U One')   as u1,
  tests.rc_app_patient((select u2 from u), 'U Two')   as u2,
  tests.rc_app_patient((select u3 from u), 'U Three') as u3;
create temp table t as select
  tests.rc_monday() as mon,
  tests.rc_in(5) as a,  tests.rc_in(6) as b,  tests.rc_in(7) as c,  tests.rc_in(8) as d,
  tests.rc_in(9) as e,  tests.rc_in(10) as f, tests.rc_in(11) as g,
  tests.rc_in(0.5) as soon, tests.rc_in(61 * 24) as far, tests.rc_in(59 * 24) as okfar,
  tests.rc_in(30) as off, tests.rc_in(-3) as past, tests.rc_in(100 * 24) as st_adv,
  tests.rc_in(40) as st_doc, tests.rc_in(41) as st_adm, tests.rc_in(42) as st_x;
create temp table visits_of as select
  (select id from public.visits where pregnancy_id = (select p1 from preg) and seq = 5) as p1_v5,
  (select id from public.visits where pregnancy_id = (select p2 from preg) and seq = 7) as p2_v7;
grant select on u, preg, t, visits_of to authenticated;

insert into public.care_team (pregnancy_id, doctor_id, care_role) values
  ((select p1 from preg), (select d_back from u), 'backup'),
  ((select p1 from preg), (select d_part from u), 'backup');
insert into public.doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes)
values ((select d_part from u), 1, '10:00', '11:00', 15);
insert into public.doctor_time_off (doctor_id, starts_at, ends_at, reason)
values ((select d_open from u), (select off from t), (select off from t) + interval '15 minutes', 'leave');
-- Appointments that must NOT count towards P1's limit: cancelled, no_show, and a finished one.
select tests.rc_appt((select p1 from preg), (select d_back from u), (select far from t) + interval '5 hours', 'cancelled');
select tests.rc_appt((select p1 from preg), (select d_back from u), (select far from t) + interval '6 hours', 'no_show');
select tests.rc_appt((select p1 from preg), (select d_back from u), (select past from t) - interval '48 hours', 'completed');

-- ================================================================= patient path
select tests.login_as((select p1 from u));

select lives_ok($$ select public.book_appointment((select d_open from u), (select a from t), null, null, 'Routine check') $$,
  'P1 books a free slot with her primary doctor');
select tests.logout();
select is((select status::text || '/' || booking_channel::text from public.appointments where doctor_id = (select d_open from u) and starts_at = (select a from t)),
  'booked/app', 'status booked, channel app');
select is((select ends_at - starts_at from public.appointments where doctor_id = (select d_open from u) and starts_at = (select a from t)),
  interval '15 minutes', 'ends_at = starts_at + slot_minutes');
select is((select booked_by from public.appointments where doctor_id = (select d_open from u) and starts_at = (select a from t)),
  (select p1 from u), 'booked_by is the caller');
select is((select patient_id from public.appointments where doctor_id = (select d_open from u) and starts_at = (select a from t)),
  tests.rc_patient_of((select p1 from preg)), 'appointment belongs to her patient record');
select is((select reason from public.appointments where doctor_id = (select d_open from u) and starts_at = (select a from t)),
  'Routine check', 'reason is stored');

select tests.login_as((select p2 from u));
select throws_ok($$ select public.book_appointment((select d_open from u), (select a from t)) $$,
  'SLOT_TAKEN', 'a slot held by another patient is rejected (SLOT_TAKEN)');

select tests.login_as((select p1 from u));
select throws_ok($$ select public.book_appointment((select d_other from u), (select b from t)) $$,
  'NOT_ON_CARE_TEAM', 'doctor outside her care team is rejected, even if accepting new patients');
select throws_ok($$ select public.book_appointment((select d_part from u), tests.rc_at((select mon from t), '12:00')) $$,
  'OUTSIDE_AVAILABILITY', 'outside the weekly hours');
select throws_ok($$ select public.book_appointment((select d_part from u), tests.rc_at((select mon from t), '10:07')) $$,
  'OUTSIDE_AVAILABILITY', 'a start that is not on the slot grid');
select throws_ok($$ select public.book_appointment((select d_part from u), tests.rc_at((select mon from t), '11:00')) $$,
  'OUTSIDE_AVAILABILITY', 'a slot that would start when the working hours end');
select throws_ok($$ select public.book_appointment((select d_part from u), tests.rc_at((select mon from t) + 1, '10:00')) $$,
  'OUTSIDE_AVAILABILITY', 'a weekday without availability');
select throws_ok($$ select public.book_appointment((select d_open from u), (select off from t)) $$,
  'DOCTOR_UNAVAILABLE', 'during doctor time off');
select throws_ok($$ select public.book_appointment((select d_open from u), (select soon from t)) $$,
  'TOO_SOON', 'inside min_lead_hours');
select throws_ok($$ select public.book_appointment((select d_open from u), (select past from t)) $$,
  'TOO_SOON', 'a slot in the past');
select throws_ok($$ select public.book_appointment((select d_open from u), (select far from t)) $$,
  'TOO_FAR_AHEAD', 'beyond max_advance_days');
select throws_ok($$ select public.book_appointment((select d_open from u), (select b from t), null, (select p2 from preg)) $$,
  'NOT_ALLOWED', 'another patient''s pregnancy');
select throws_ok($$ select public.book_appointment((select d_open from u), (select b from t), (select p2_v7 from visits_of)) $$,
  'INVALID_INPUT', 'a visit from another pregnancy');
select throws_ok($$ select public.book_appointment(gen_random_uuid(), (select b from t)) $$,
  'NOT_FOUND', 'unknown doctor');
select throws_ok($$ select public.book_appointment((select desk from u), (select b from t)) $$,
  'NOT_FOUND', 'a user that is not a doctor');
select throws_ok($$ select public.book_appointment((select d_open from u), (select b from t), null, null, repeat('x', 501)) $$,
  'INVALID_INPUT', 'reason longer than 500 characters');
select tests.logout();
select is((select count(*)::int from public.appointments where starts_at = (select b from t)), 0, 'rejected bookings leave no rows');

-- more successes: backup doctor on the grid edge, and a visit-linked booking with her own pregnancy id
select tests.login_as((select p1 from u));
select lives_ok($$ select public.book_appointment((select d_part from u), tests.rc_at((select mon from t), '10:45')) $$,
  'last slot of the working hours is bookable (backup doctor)');
select lives_ok($$ select public.book_appointment((select d_open from u), (select c from t), (select p1_v5 from visits_of), (select p1 from preg), 'Booking visit') $$,
  'booking with a planned visit and her own pregnancy id');
select tests.logout();
select is((select status::text from public.visits where id = (select p1_v5 from visits_of)), 'scheduled', 'the linked visit becomes scheduled');
select is((select appointment_id from public.visits where id = (select p1_v5 from visits_of)),
  (select id from public.appointments where doctor_id = (select d_open from u) and starts_at = (select c from t)), 'the visit points at the new appointment');
select is((select visit_id from public.appointments where doctor_id = (select d_open from u) and starts_at = (select c from t)),
  (select p1_v5 from visits_of), 'the appointment points at the visit');

-- P1 now has 3 active upcoming appointments (cancelled / no_show / past ones do not count)
select tests.login_as((select p1 from u));
select throws_ok($$ select public.book_appointment((select d_open from u), (select d from t)) $$,
  'MAX_UPCOMING', 'a verified patient is limited to 3 upcoming appointments');

-- P2: far-but-inside window, visit rules
select tests.login_as((select p2 from u));
select lives_ok($$ select public.book_appointment((select d_open from u), (select okfar from t), (select p2_v7 from visits_of)) $$,
  '59 days ahead is inside the advance window');
select throws_ok($$ select public.book_appointment((select d_open from u), (select b from t), (select p2_v7 from visits_of)) $$,
  'INVALID_INPUT', 'a visit that already has an active appointment cannot be booked again');
select throws_ok($$ select public.book_appointment((select d_open from u), (select far from t)) $$,
  'TOO_FAR_AHEAD', '61 days ahead is beyond the advance window');

-- ================================================================= first visit rule (unverified patients)
select tests.login_as((select u1 from u));
select lives_ok($$ select public.book_appointment((select d_open from u), (select e from t)) $$,
  'unverified patient without a care team books an accepting doctor');
select tests.logout();
select is((select care_role::text from public.care_team where pregnancy_id = (select u1 from preg) and doctor_id = (select d_open from u) and removed_at is null),
  'primary', 'the doctor became her primary');
select is((select added_by from public.care_team where pregnancy_id = (select u1 from preg) and doctor_id = (select d_open from u)),
  (select u1 from u), 'added_by is the caller');
select tests.login_as((select u1 from u));
select throws_ok($$ select public.book_appointment((select d_open from u), (select f from t)) $$,
  'MAX_UPCOMING', 'unverified patients are limited to 1 upcoming appointment');
select throws_ok($$ select public.book_appointment((select d_other from u), (select f from t)) $$,
  'NOT_ON_CARE_TEAM', 'after the first booking another accepting doctor is not on her team');

select tests.login_as((select u2 from u));
select throws_ok($$ select public.book_appointment((select d_noacc from u), (select f from t)) $$,
  'DOCTOR_NOT_ACCEPTING', 'first visit with a doctor who does not accept new patients');
select throws_ok($$ select public.book_appointment((select d_open from u), (select e from t)) $$,
  'SLOT_TAKEN', 'first visit on a slot that is taken');
select tests.logout();
select is((select count(*)::int from public.care_team where pregnancy_id = (select u2 from preg)), 0, 'failed first bookings do not add a primary');

-- ================================================================= not patients
select tests.login_as((select comp from u));
select throws_ok($$ select public.book_appointment((select d_open from u), (select f from t)) $$,
  'NOT_ALLOWED', 'companions cannot book');
select tests.logout();
select throws_ok($$ select public.book_appointment((select d_open from u), (select f from t)) $$,
  'NOT_AUTHENTICATED', 'no session');
select set_config('role', 'anon', true);
select throws_ok($$ select public.book_appointment(gen_random_uuid(), now()) $$,
  '42501', null, 'anon cannot execute book_appointment');
select tests.logout();

-- ================================================================= staff path
select tests.login_as((select desk from u));
select throws_ok($$ select public.book_appointment((select d_open from u), (select f from t)) $$,
  'INVALID_INPUT', 'staff must pass p_pregnancy');
select throws_ok($$ select public.book_appointment((select d_open from u), (select f from t), null, gen_random_uuid()) $$,
  'NOT_FOUND', 'staff: unknown pregnancy');
select lives_ok($$ select public.book_appointment((select d_open from u), (select soon from t), null, (select p1 from preg), 'Walk-in') $$,
  'reception bypasses lead time and max upcoming (P1 already has 3)');
select lives_ok($$ select public.book_appointment((select d_open from u), (select st_adv from t), null, (select p1 from preg)) $$,
  'reception bypasses the advance window');
select throws_ok($$ select public.book_appointment((select d_open from u), (select past from t), null, (select p1 from preg)) $$,
  'TOO_SOON', 'staff cannot book a slot that is already over');
select throws_ok($$ select public.book_appointment((select d_other from u), (select g from t), null, (select p1 from preg)) $$,
  'NOT_ON_CARE_TEAM', 'staff: doctor must be on the care team when there is a primary');
select throws_ok($$ select public.book_appointment((select d_part from u), tests.rc_at((select mon from t), '12:00'), null, (select p1 from preg)) $$,
  'OUTSIDE_AVAILABILITY', 'staff: availability still enforced');
select throws_ok($$ select public.book_appointment((select d_open from u), (select off from t), null, (select p1 from preg)) $$,
  'DOCTOR_UNAVAILABLE', 'staff: time off still enforced');
select throws_ok($$ select public.book_appointment((select d_open from u), (select a from t), null, (select p1 from preg)) $$,
  'SLOT_TAKEN', 'staff: double booking still rejected');
select lives_ok($$ select public.book_appointment((select d_open from u), (select g from t), null, (select u3 from preg)) $$,
  'reception books a first visit for an app patient without a care team');
select throws_ok($$ select public.book_appointment((select d_noacc from u), (select f from t), null, (select u2 from preg)) $$,
  'DOCTOR_NOT_ACCEPTING', 'staff: first visit with a doctor who does not accept new patients');
select tests.logout();
select is((select booking_channel::text || '/' || booked_by::text from public.appointments where doctor_id = (select d_open from u) and starts_at = (select soon from t)),
  'reception/' || (select desk from u)::text, 'reception bookings carry channel reception and booked_by');
select is((select care_role::text from public.care_team where pregnancy_id = (select u3 from preg) and doctor_id = (select d_open from u)),
  'primary', 'the desk-booked first visit made the doctor primary');

-- closed pregnancy
update public.pregnancies set status = 'closed' where id = (select u2 from preg);
select tests.login_as((select desk from u));
select throws_ok($$ select public.book_appointment((select d_open from u), (select f from t), null, (select u2 from preg)) $$,
  'NOT_FOUND', 'staff: a closed pregnancy cannot be booked');

-- doctor path
select tests.login_as((select d_open from u));
select lives_ok($$ select public.book_appointment((select d_open from u), (select st_doc from t), null, (select p1 from preg)) $$,
  'a care-team doctor books for her own patient');
select throws_ok($$ select public.book_appointment((select d_open from u), (select f from t)) $$,
  'INVALID_INPUT', 'doctor must pass p_pregnancy');
select throws_ok($$ select public.book_appointment((select d_other from u), (select f from t), null, (select p1 from preg)) $$,
  'NOT_ON_CARE_TEAM', 'doctor: the booked doctor must be on the care team');
select tests.login_as((select d_other from u));
select throws_ok($$ select public.book_appointment((select d_other from u), (select f from t), null, (select p1 from preg)) $$,
  'NOT_ALLOWED', 'a doctor not on the care team cannot book for the patient');

-- admin path
select tests.login_as((select admin from u));
select lives_ok($$ select public.book_appointment((select d_open from u), (select st_adm from t), null, (select p1 from preg)) $$,
  'admin books for any patient');
select tests.logout();
select is((select booking_channel::text from public.appointments where doctor_id = (select d_open from u) and starts_at = (select st_doc from t)),
  'doctor', 'doctor bookings carry channel doctor');
select is((select booking_channel::text from public.appointments where doctor_id = (select d_open from u) and starts_at = (select st_adm from t)),
  'admin', 'admin bookings carry channel admin');

-- ================================================================= no direct writes, ever
select tests.login_as((select desk from u));
select throws_ok($$ insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
  values (tests.rc_patient_of((select p1 from preg)), (select p1 from preg), (select d_open from u), (select st_x from t), (select st_x from t) + interval '15 minutes', 'reception') $$,
  '42501', null, 'receptionists have no direct insert policy on appointments');
select is_empty($$ update public.appointments set status = 'cancelled' returning 1 $$, 'receptionists cannot update appointments directly');
select tests.logout();

select * from finish();
rollback;
