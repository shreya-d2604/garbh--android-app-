-- Admin demo data: one failing example for every data-quality rule (PLAN.md §7.6 #4, Phase 8 exit).
-- Runs after seed.sql. Patients whose name starts with "DQ Demo" exist only to be found and fixed in
-- Admin > Data quality. Anjali Gupta (seed.sql, 33 weeks, one doctor) is the t3_no_backup example.

-- A doctor who has left the hospital: the care team below has only her -> primary_inactive.
create function pg_temp.seed_left_doctor() returns void language sql as $$
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated',
    'dr.vikram@garbh.test', '', now(),
    '{"provider":"email","providers":["email"],"role":"doctor"}', '{"full_name":"Dr. Vikram Joshi"}', now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000005',
          '{"sub":"00000000-0000-4000-a000-000000000005","email":"dr.vikram@garbh.test","email_verified":true}',
          'email', now(), now(), now());
$$;
select pg_temp.seed_left_doctor();
update public.profiles set consent_at = now(), is_active = false
  where id = '00000000-0000-4000-a000-000000000005';
insert into public.staff_details (profile_id, designation, specialization, registration_no)
  values ('00000000-0000-4000-a000-000000000005', 'Consultant', 'Obstetrics & Gynaecology', 'MMC-2009-0777');

-- Patients (desk records, verified) without an app account, plus one self-registration left unverified.
insert into public.patients (id, mrn, full_name, phone, registration_source, verified_at, created_at) values
  ('10000000-0000-4000-8000-0000000000a1', 'DQ-0001', 'DQ Demo - no dates',         '+919800000201', 'desk', now(), now() - interval '40 days'),
  ('10000000-0000-4000-8000-0000000000a2', 'DQ-0002', 'DQ Demo - overdue 43 weeks', '+919800000202', 'desk', now(), now() - interval '300 days'),
  ('10000000-0000-4000-8000-0000000000a3', 'DQ-0003', 'DQ Demo - no doctor',        '+919800000203', 'desk', now(), now() - interval '30 days'),
  ('10000000-0000-4000-8000-0000000000a4', 'DQ-0004', 'DQ Demo - doctor left',      '+919800000204', 'desk', now(), now() - interval '60 days');
insert into public.patients (id, full_name, phone, registration_source, created_at) values
  ('10000000-0000-4000-8000-0000000000a5', 'DQ Demo - unverified 20 days', '+919800000205', 'app', now() - interval '20 days');

insert into public.pregnancies (id, patient_id, lmp_date, lmp_source, risk_level) values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', null,                                'clinician', 'low'),
  ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a2', public.hospital_today() - 301,        'clinician', 'moderate'),
  ('20000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-0000000000a3', public.hospital_today() - (16*7),     'clinician', 'low'),
  ('20000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-0000000000a4', public.hospital_today() - (22*7),     'clinician', 'low'),
  ('20000000-0000-4000-8000-0000000000a5', '10000000-0000-4000-8000-0000000000a5', public.hospital_today() - (10*7),     'patient_reported', 'low');

-- Care teams: a primary for the first two (the overdue one has a backup too), nobody for "no doctor",
-- and only the departed doctor for "doctor left".
insert into public.care_team (pregnancy_id, doctor_id, care_role, added_by) values
  ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-a000-000000000002', 'primary', '00000000-0000-4000-a000-000000000001'),
  ('20000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-a000-000000000002', 'primary', '00000000-0000-4000-a000-000000000001'),
  ('20000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-a000-000000000003', 'backup',  '00000000-0000-4000-a000-000000000001'),
  ('20000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-a000-000000000005', 'primary', '00000000-0000-4000-a000-000000000001');

-- past_booked: Priya's appointment from yesterday was never closed.
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, status, reason, booked_by, booking_channel) values
  ('30000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-a000-000000000002',
   ((public.hospital_today() - 1) + time '12:00') at time zone 'Asia/Kolkata',
   ((public.hospital_today() - 1) + time '12:15') at time zone 'Asia/Kolkata',
   'booked', 'Routine visit', '00000000-0000-4000-a000-000000000004', 'reception');

-- consult_unpublished (3 days old, no advice published) and implausible_values (BP 300/20), both Priya.
insert into public.consultations (id, pregnancy_id, doctor_id, ga_weeks, ga_days, bp_systolic, bp_diastolic, pulse, complaints, created_at) values
  ('40000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-a000-000000000002',
   8, 6, 110, 70, 80, 'Nausea', now() - interval '3 days'),
  ('40000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-a000-000000000002',
   9, 1, 300, 20, 82, 'Routine', now() - interval '2 hours');
update public.consultations set published_at = now() - interval '1 hour' where id = '40000000-0000-4000-8000-0000000000a2';

-- lab_unverified_48h and ai_draft_24h: Sunita's report values and summary have been waiting for 3 days.
insert into public.reports (id, pregnancy_id, type, title, report_date, lab_name, extraction_status, uploaded_by, created_at) values
  ('50000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000002', 'blood', 'CBC', public.hospital_today() - 3,
   'City Diagnostics', 'done', '00000000-0000-4000-a000-000000000002', now() - interval '3 days');
insert into public.lab_results (report_id, pregnancy_id, test_code, raw_name, value_num, unit, ref_low, ref_high, flag, source, confidence, verified, observed_on, created_at) values
  ('50000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000002', 'HB',  'Haemoglobin', 10.8, 'g/dL', 11, 15, 'low', 'ai_extracted', 0.9, false, public.hospital_today() - 3, now() - interval '3 days'),
  ('50000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000002', 'PLT', 'Platelets',   210,  '10^3/uL', 150, 400, 'normal', 'ai_extracted', 0.9, false, public.hospital_today() - 3, now() - interval '3 days');
insert into public.ai_summaries (id, pregnancy_id, source_type, source_id, status, model, prompt_version, draft, generated_at) values
  ('60000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000002', 'report', '50000000-0000-4000-8000-0000000000a1',
   'draft', 'mock', 'v0', '{"summary":{"headline":"Haemoglobin is a little low.","doctor_attention_flags":["Hb 10.8"]}}', now() - interval '3 days');
