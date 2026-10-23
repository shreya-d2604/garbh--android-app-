-- Doctor demo data (runs after seed.sql). Owner: doctor.
-- Gives the Today queue some life and the AI review inbox a report draft to review.
-- Appointments are placed at 08:05 / 08:20, before any doctor's working hours, so they can never
-- overlap rows other seed files add.

-- Today's queue for Dr. Asha: Priya already checked in (booked in the app), Sunita still to come.
insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, status, reason, booked_by, booking_channel, checked_in_at) values
  ('30000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-a000-000000000002',
   (public.hospital_today() + time '08:05') at time zone 'Asia/Kolkata',
   (public.hospital_today() + time '08:15') at time zone 'Asia/Kolkata',
   'checked_in', 'First trimester check', '00000000-0000-4000-a000-000000000011', 'app',
   (public.hospital_today() + time '08:00') at time zone 'Asia/Kolkata'),
  ('30000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '00000000-0000-4000-a000-000000000002',
   (public.hospital_today() + time '08:20') at time zone 'Asia/Kolkata',
   (public.hospital_today() + time '08:30') at time zone 'Asia/Kolkata',
   'booked', 'Rh-negative follow-up', '00000000-0000-4000-a000-000000000004', 'reception', null)
on conflict (id) do nothing;

-- Anjali (GDM, Dr. Meera): a glucose report whose values the AI extracted, waiting for review.
-- No file is attached (storage objects cannot be created from SQL); the review screen shows that.
insert into public.reports (id, pregnancy_id, type, title, report_date, lab_name, uploaded_by, extraction_status) values
  ('50000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000004', 'gtt', 'Glucose tolerance test',
   public.hospital_today() - 1, 'City Diagnostics', '00000000-0000-4000-a000-000000000003', 'done')
on conflict (id) do nothing;

insert into public.lab_results (report_id, pregnancy_id, test_code, raw_name, value_num, unit, ref_low, ref_high, flag, source, confidence, verified, observed_on) values
  ('50000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000004', 'FBS', 'Fasting plasma glucose', 98, 'mg/dL', 60, 92, 'high', 'ai_extracted', 0.62, false, public.hospital_today() - 1),
  ('50000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000004', 'OGTT_2H', 'OGTT 2 hour', 152, 'mg/dL', null, 140, 'high', 'ai_extracted', 0.93, false, public.hospital_today() - 1);

insert into public.ai_summaries (pregnancy_id, source_type, source_id, status, model, prompt_version, draft, generated_at) values
  ('20000000-0000-4000-8000-000000000004', 'report', '50000000-0000-4000-8000-000000000011', 'draft', 'mock', 'v0',
   '{"lab_values":[{"raw_name":"Fasting plasma glucose","test_code":"FBS","value":98,"value_text":null,"unit":"mg/dL","ref_range_on_report":"60-92","confidence":0.62},{"raw_name":"OGTT 2 hour","test_code":"OGTT_2H","value":152,"value_text":null,"unit":"mg/dL","ref_range_on_report":"<140","confidence":0.93}],"summary":{"headline":"Your sugar levels are higher than the target range.","plain_language_summary":"Your fasting sugar and your 2-hour sugar after the glucose drink are above the usual targets for pregnancy. Your doctor will explain what this means for you.","key_findings":[{"finding":"Fasting sugar 98 mg/dL","status":"attention","explanation":"A little above the usual fasting target."},{"finding":"2-hour sugar 152 mg/dL","status":"attention","explanation":"Above the usual 2-hour target."}],"foods_to_eat":[{"item":"Whole grains, dal, vegetables","why":"Release sugar slowly"}],"foods_to_avoid":[{"item":"Sweets and sugary drinks","why":"Raise blood sugar quickly"}],"medicines_to_avoid":[],"lifestyle_tips":["Walk for 20 minutes after meals"],"questions_for_doctor":["Do I need to check my sugar at home?"],"doctor_attention_flags":["FBS 98 and OGTT 2h 152 at 33w: confirm GDM management plan; FBS confidence is low, check the report."],"confidence_note":"The fasting value was hard to read."}}',
   now() - interval '1 hour');
