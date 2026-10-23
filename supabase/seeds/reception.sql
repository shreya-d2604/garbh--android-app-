-- Reception demo data (runs after seed.sql). Owner: reception.
-- Dr. Meera is away tomorrow afternoon, which covers Anjali's 14:30 appointment from seed.sql, so
-- the "Doctor unavailable" worklist has something to rebook.
insert into public.doctor_time_off (doctor_id, starts_at, ends_at, reason) values
  ('00000000-0000-4000-a000-000000000003',
   ((public.hospital_today() + 1) + time '14:00') at time zone 'Asia/Kolkata',
   ((public.hospital_today() + 1) + time '17:00') at time zone 'Asia/Kolkata',
   'Conference');
