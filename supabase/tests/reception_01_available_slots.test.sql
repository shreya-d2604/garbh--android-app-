-- available_slots: availability - time off - active appointments, timezone, patient rules, roles.
begin;
\ir helpers/setup.psql
\ir helpers/reception.psql
select plan(30);

create temp table u as select
  tests.create_user('doc.a@x.test', 'doctor')       as doc_a,       -- Mon 10:00-11:00 (15 min), Wed 09:00-10:00 (30 min); accepts new patients
  tests.create_user('doc.b@x.test', 'doctor')       as doc_b,       -- does not accept new patients
  tests.rc_open_doctor('doc.open@x.test')           as doc_open,    -- open around the clock
  tests.create_user('desk@x.test', 'receptionist')  as desk,
  tests.create_user('admin@x.test', 'admin')        as admin,
  tests.create_user('p1@x.test', 'patient')         as p1,          -- verified, primary = doc_a
  tests.create_user('p2@x.test', 'patient')         as p2,          -- verified, primary = doc_open
  tests.create_user('pn@x.test', 'patient')         as pn,          -- self-registered, no care team
  tests.create_user('comp@x.test', 'companion')     as comp;
create temp table m as select tests.rc_monday() as mon;
create temp table preg as select
  tests.create_pregnancy((select p1 from u), (select doc_a from u), 20)    as p1,
  tests.create_pregnancy((select p2 from u), (select doc_open from u), 20) as p2,
  tests.rc_app_patient((select pn from u))                                  as pn;
grant select on u, m, preg to authenticated;

insert into public.staff_details (profile_id, accepts_new_patients)
values ((select doc_a from u), true), ((select doc_b from u), false);
insert into public.doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes) values
  ((select doc_a from u), 1, '10:00', '11:00', 15),
  ((select doc_a from u), 3, '09:00', '10:00', 30);
-- 10:00 booked, 10:15 cancelled, 10:30 blocked by time off (10:30-10:40 overlaps the 10:30 slot), 10:45 no_show
insert into public.doctor_time_off (doctor_id, starts_at, ends_at, reason)
values ((select doc_a from u), tests.rc_at((select mon from m), '10:30'), tests.rc_at((select mon from m), '10:40'), 'meeting');
select tests.rc_appt((select p1 from preg), (select doc_a from u), tests.rc_at((select mon from m), '10:00'), 'booked');
select tests.rc_appt((select p1 from preg), (select doc_a from u), tests.rc_at((select mon from m), '10:15'), 'cancelled');
select tests.rc_appt((select p1 from preg), (select doc_a from u), tests.rc_at((select mon from m), '10:45'), 'no_show');

-- ---- receptionist: availability - time off - booked; cancelled / no_show slots are free again
select tests.login_as((select desk from u));
select is(
  array(select starts_at from public.available_slots((select doc_a from u), (select mon from m), (select mon from m))),
  array[tests.rc_at((select mon from m), '10:15'), tests.rc_at((select mon from m), '10:45')],
  'staff: free slots = availability minus time off minus active appointments');
select is(
  (select count(*)::int from public.available_slots((select doc_a from u), (select mon from m), (select mon from m) + 2)),
  4, 'range covers several days (2 Monday + 2 Wednesday slots)');
select is(
  (select ends_at - starts_at from public.available_slots((select doc_a from u), (select mon from m) + 2, (select mon from m) + 2) limit 1),
  interval '30 minutes', 'slot length comes from the availability row');
select is(
  (select min(starts_at) at time zone 'UTC' from public.available_slots((select doc_a from u), (select mon from m), (select mon from m))),
  (select ((mon + time '04:45')) from m), 'wall-clock 10:15 Asia/Kolkata is 04:45 UTC');
select is(
  (select count(*)::int from public.available_slots((select doc_a from u), (select mon from m) + 1, (select mon from m) + 1)),
  0, 'a day without availability has no slots');

-- ---- range validation
select throws_ok($$ select * from public.available_slots((select doc_a from u), current_date + 5, current_date + 4) $$,
  'INVALID_INPUT', 'from after to is rejected');
select throws_ok($$ select * from public.available_slots((select doc_a from u), current_date, current_date + 62) $$,
  'INVALID_INPUT', 'a 63-day range is rejected');
select lives_ok($$ select * from public.available_slots((select doc_a from u), current_date, current_date + 61) $$,
  'a 62-day range is accepted');
select throws_ok($$ select * from public.available_slots(null, current_date, current_date + 1) $$,
  'INVALID_INPUT', 'null doctor is rejected');
select is((select count(*)::int from public.available_slots(gen_random_uuid(), (select mon from m), (select mon from m))),
  0, 'unknown doctor: no slots');
select is((select count(*)::int from public.available_slots((select p1 from u), (select mon from m), (select mon from m))),
  0, 'a non-doctor id: no slots');

-- ---- staff see slots around the clock but never past ones; no lead-time or advance filtering
select ok(
  (select bool_and(ends_at > now()) and min(starts_at) < now() + interval '2 hours' and max(starts_at) > now() + interval '60 days'
     from public.available_slots((select doc_open from u), public.hospital_today(), public.hospital_today() + 61)),
  'staff: slots are not in the past, but lead time and advance window are not applied');

-- ---- other roles that may call it
select tests.login_as((select admin from u));
select is((select count(*)::int from public.available_slots((select doc_a from u), (select mon from m), (select mon from m))), 2, 'admin can read slots');
select tests.login_as((select doc_b from u));
select is((select count(*)::int from public.available_slots((select doc_a from u), (select mon from m), (select mon from m))), 2,
  'a doctor can read another doctor''s slots');

-- ---- patient: care-team doctors only, lead time and advance window applied
select tests.login_as((select p1 from u));
select is(
  array(select starts_at from public.available_slots((select doc_a from u), (select mon from m), (select mon from m))),
  array[tests.rc_at((select mon from m), '10:15'), tests.rc_at((select mon from m), '10:45')],
  'patient sees the free slots of her care-team doctor');
select is((select count(*)::int from public.available_slots((select doc_b from u), (select mon from m), (select mon from m) + 2)), 0,
  'patient with a primary: a doctor outside her care team returns nothing');
select is((select count(*)::int from public.available_slots((select doc_open from u), public.hospital_today(), public.hospital_today() + 7)), 0,
  'patient with a primary: an accepting doctor outside her care team still returns nothing');

select tests.login_as((select p2 from u));
select ok(
  (select count(*) > 0 and bool_and(starts_at >= now() + interval '2 hours') and bool_and(starts_at <= now() + interval '60 days')
     from public.available_slots((select doc_open from u), public.hospital_today(), public.hospital_today() + 61)),
  'patient: slots respect min_lead_hours and max_advance_days');

select tests.login_as((select pn from u));
select is((select count(*)::int from public.available_slots((select doc_a from u), (select mon from m), (select mon from m))), 2,
  'patient without a primary sees an accepting doctor');
select is((select count(*)::int from public.available_slots((select doc_b from u), (select mon from m), (select mon from m) + 2)), 0,
  'patient without a primary: a doctor not accepting new patients returns nothing');

-- ---- denied
select tests.login_as((select comp from u));
select throws_ok($$ select * from public.available_slots((select doc_a from u), current_date, current_date + 1) $$,
  'NOT_ALLOWED', 'companion is not allowed');
select tests.logout();
select throws_ok($$ select * from public.available_slots((select doc_a from u), current_date, current_date + 1) $$,
  'NOT_AUTHENTICATED', 'no session is rejected');
select set_config('role', 'anon', true);
select throws_ok($$ select * from public.available_slots(gen_random_uuid(), current_date, current_date + 1) $$,
  '42501', null, 'anon cannot execute available_slots');
select tests.logout();

-- ---- deactivated doctor
update public.profiles set is_active = false where id = (select doc_a from u);
select tests.login_as((select desk from u));
select is((select count(*)::int from public.available_slots((select doc_a from u), (select mon from m), (select mon from m))), 0,
  'a deactivated doctor has no slots');
select tests.logout();
update public.profiles set is_active = true where id = (select doc_a from u);

-- ---- consistency with the booking-side slot check (private.slot_end)
select tests.claims_as((select desk from u));   -- JWT claims only: stay superuser so private.* is reachable
select is(
  (select count(*)::int from public.available_slots((select doc_open from u), public.hospital_today(), public.hospital_today() + 30) s
    where private.slot_end((select doc_open from u), s.starts_at) is distinct from s.ends_at),
  0, 'every slot offered by available_slots is accepted by the booking-side grid check');
select ok(private.slot_end((select doc_a from u), tests.rc_at((select mon from m), '10:00')) is not null, 'first slot of the day is on the grid');
select ok(private.slot_end((select doc_a from u), tests.rc_at((select mon from m), '10:45')) is not null, 'last slot of the day is on the grid');
select ok(private.slot_end((select doc_a from u), tests.rc_at((select mon from m), '10:07')) is null, 'a misaligned start is off the grid');
select ok(private.slot_end((select doc_a from u), tests.rc_at((select mon from m), '11:00')) is null, 'the end of the working hours is not a slot start');
select ok(private.slot_end((select doc_a from u), tests.rc_at((select mon from m), '09:45')) is null, 'before the working hours is off the grid');

select * from finish();
rollback;
