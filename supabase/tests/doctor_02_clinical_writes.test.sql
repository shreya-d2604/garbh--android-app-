-- Clinical write policies (AGENTS.md §6): pregnancies, patients (medical fields), visits,
-- consultations, private notes, prescription_items, reports, report_files, lab_results.
-- Allowed for care-team doctors (primary AND backup); denied for a doctor not on the team
-- (zero rows changed / 42501), receptionists, patients, companions; a removed backup loses
-- write access at once.
begin;
\ir helpers/setup.psql
\ir helpers/doctor.psql
select plan(130);

create temp table u as select
  tests.create_user('prim@x.test',   'doctor')       as prim,    -- primary on t
  tests.create_user('backup@x.test', 'doctor')       as backup,  -- backup on t AND t2
  tests.create_user('other@x.test',  'doctor')       as other,   -- primary on t2, NOT on t
  tests.create_user('desk@x.test',   'receptionist') as desk,
  tests.create_user('pat@x.test',    'patient')      as pat,
  tests.create_user('comp@x.test',   'companion')    as comp;
create temp table t  as select tests.create_pregnancy((select pat from u), (select prim from u), 24) as preg;
create temp table t2 as select tests.create_pregnancy(null, (select other from u), 10) as preg;
insert into public.care_team (pregnancy_id, doctor_id, care_role) values
  ((select preg from t),  (select backup from u), 'backup'),
  ((select preg from t2), (select backup from u), 'backup');
create temp table ids as select
  (select patient_id from public.pregnancies where id = (select preg from t))  as pt,
  (select patient_id from public.pregnancies where id = (select preg from t2)) as pt2;
insert into public.companion_links (patient_id, companion_user_id, relation, status, can_view_appointments, can_view_journey,
                                    can_view_summaries, can_view_reports, can_view_prescriptions)
values ((select pt from ids), (select comp from u), 'husband', 'approved', true, true, true, true, true);

create temp table r as select
  gen_random_uuid() as a1, gen_random_uuid() as a_other,
  gen_random_uuid() as c_pub, gen_random_uuid() as c_draft, gen_random_uuid() as c_other,
  gen_random_uuid() as rx_pub, gen_random_uuid() as rx_draft,
  gen_random_uuid() as rep, gen_random_uuid() as rep_other, gen_random_uuid() as file,
  gen_random_uuid() as lab_un, gen_random_uuid() as lab_ver, gen_random_uuid() as lab_other;
grant select on u, t, t2, ids, r to authenticated;

insert into public.appointments (id, patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel) values
  ((select a1 from r),      (select pt from ids),  (select preg from t),  (select prim from u),  now() + interval '1 day', now() + interval '1 day 15 min', 'reception'),
  ((select a_other from r), (select pt2 from ids), (select preg from t2), (select other from u), now() + interval '1 day', now() + interval '1 day 15 min', 'reception');
insert into public.consultations (id, pregnancy_id, doctor_id, advice, published_at) values
  ((select c_pub from r),   (select preg from t),  (select prim from u),  'published advice', now()),
  ((select c_draft from r), (select preg from t),  (select prim from u),  'draft advice', null),
  ((select c_other from r), (select preg from t2), (select other from u), 'other team', null);
insert into public.consultation_private_notes (consultation_id, pregnancy_id, note) values
  ((select c_draft from r), (select preg from t), 'secret note');
insert into public.prescription_items (id, consultation_id, pregnancy_id, drug_name, duration_days, start_date) values
  ((select rx_pub from r),   (select c_pub from r),   (select preg from t), 'Folic acid', 30, current_date),
  ((select rx_draft from r), (select c_draft from r), (select preg from t), 'Iron', 30, current_date);
insert into public.reports (id, pregnancy_id, type, uploaded_by) values
  ((select rep from r),       (select preg from t),  'blood', (select prim from u)),
  ((select rep_other from r), (select preg from t2), 'blood', (select other from u));
insert into public.report_files (id, report_id, storage_path, mime_type) values
  ((select file from r), (select rep from r), 'p/t/rep/f.pdf', 'application/pdf');
insert into public.lab_results (id, report_id, pregnancy_id, test_code, value_num, source, verified, verified_by) values
  ((select lab_un from r),    (select rep from r),       (select preg from t),  'HB',  10.5, 'manual', false, null),
  ((select lab_ver from r),   (select rep from r),       (select preg from t),  'TSH', 2.0,  'manual', true, (select prim from u)),
  ((select lab_other from r), (select rep_other from r), (select preg from t2), 'HB',  11.0, 'manual', false, null);
-- one planned visit per template week already exists (pregnancy trigger); mark #1 completed.
update public.visits set status = 'completed' where pregnancy_id = (select preg from t) and seq = 1;

-- ================================================================ patient / companion visibility (fixtures)
select tests.login_as((select pat from u));
select is((select count(*)::int from public.consultation_private_notes), 0, 'patient never sees private notes');
select is((select count(*)::int from public.consultations), 1, 'patient sees only the published consultation');
select is((select count(*)::int from public.prescription_items), 1, 'patient sees only prescriptions of a published consultation');
select is((select count(*)::int from public.lab_results), 1, 'patient sees only verified lab results');
select tests.login_as((select comp from u));
select is((select count(*)::int from public.consultation_private_notes), 0, 'companion never sees private notes');
select is((select count(*)::int from public.consultations), 1, 'companion sees only the published consultation');

-- ================================================================ primary doctor: allowed
select tests.login_as((select prim from u));
select is((select count(*)::int from public.consultation_private_notes), 1, 'primary reads the private note');

-- pregnancies
select is(tests.affected($$ update public.pregnancies set risk_level = 'high', risk_factors = array['GDM'] where id = (select preg from t) $$), 1,
  'primary updates pregnancy risk');
select is(tests.affected($$ update public.pregnancies set edd_usg = public.hospital_today() + 100, lmp_source = 'clinician' where id = (select preg from t) $$), 1,
  'primary sets a dating-scan EDD');
select is((select edd_final from public.pregnancies where id = (select preg from t)), public.hospital_today() + 100,
  'edd_final follows the dating-scan EDD');
select is(tests.affected($$ update public.pregnancies set status = 'delivered', outcome_date = public.hospital_today() where id = (select preg from t2) $$), 0,
  'primary cannot touch a pregnancy of another team');
select throws_ok($$ update public.pregnancies set patient_id = (select pt2 from ids) where id = (select preg from t) $$,
  'P0001', 'NOT_ALLOWED', 'a doctor cannot move a pregnancy to another patient');
select is((select count(*)::int from public.audit_log), 0, 'doctors cannot read audit_log');

-- patients (medical fields only)
select is(tests.affected($$ update public.patients set allergies = array['Penicillin'], blood_group = 'O+', rh_negative = false, chronic_conditions = array['gdm'] where id = (select pt from ids) $$), 1,
  'primary updates medical fields');
select throws_ok($$ update public.patients set full_name = 'Renamed' where id = (select pt from ids) $$,
  'P0001', 'NOT_ALLOWED', 'doctor cannot change the name');
select throws_ok($$ update public.patients set mrn = 'HACK-1' where id = (select pt from ids) $$,
  'P0001', 'NOT_ALLOWED', 'doctor cannot change the MRN');
select throws_ok($$ update public.patients set verified_at = now() + interval '1 day' where id = (select pt from ids) $$,
  'P0001', 'NOT_ALLOWED', 'doctor cannot verify a patient');

-- visits
select lives_ok($$ insert into public.visits (pregnancy_id, seq, target_week, title, is_extra, reason_added, added_by, due_from, due_to)
  values ((select preg from t), 99, 25, 'BP follow-up', true, 'High BP follow-up', (select prim from u), current_date, current_date + 7) $$,
  'primary adds an extra visit');
select throws_ok($$ insert into public.visits (pregnancy_id, seq, target_week, title, is_extra, added_by)
  values ((select preg from t), 98, 25, 'Not extra', false, (select prim from u)) $$,
  '42501', null, 'doctors cannot insert template (non-extra) visits');
select throws_ok($$ insert into public.visits (pregnancy_id, seq, target_week, title, is_extra, added_by)
  values ((select preg from t), 97, 25, 'Forged', true, (select other from u)) $$,
  '42501', null, 'added_by cannot be forged');
select is(tests.affected($$ update public.visits set status = 'skipped' where pregnancy_id = (select preg from t) and seq = 3 $$), 1,
  'primary skips a visit');
select is(tests.affected($$ update public.visits set due_from = due_from + 7, due_to = due_to + 7, recommended_tests = array['CBC'] where pregnancy_id = (select preg from t) and seq = 4 $$), 1,
  'primary moves a visit and edits its tests');
select is(tests.affected($$ delete from public.visits where pregnancy_id = (select preg from t) and seq = 99 $$), 1,
  'primary deletes an extra visit');
select is(tests.affected($$ delete from public.visits where pregnancy_id = (select preg from t) and seq = 1 $$), 0,
  'a completed visit cannot be deleted');

-- consultations
select lives_ok($$ insert into public.consultations (pregnancy_id, doctor_id, appointment_id, ga_weeks, ga_days, bp_systolic, bp_diastolic, advice)
  values ((select preg from t), (select prim from u), (select a1 from r), 24, 3, 118, 76, 'Rest and fluids') $$,
  'primary creates a consultation for an appointment');
select throws_ok($$ insert into public.consultations (pregnancy_id, doctor_id, advice)
  values ((select preg from t), (select other from u), 'on behalf of') $$,
  '42501', null, 'doctor_id must be the caller');
select throws_ok($$ insert into public.consultations (pregnancy_id, doctor_id, appointment_id, advice)
  values ((select preg from t), (select prim from u), (select a_other from r), 'x') $$,
  'P0001', 'INVALID_INPUT', 'an appointment of another pregnancy cannot be attached');
select is(tests.affected($$ update public.consultations set advice = 'Edited advice', bp_systolic = 120 where id = (select c_draft from r) $$), 1,
  'primary edits a consultation draft');
select throws_ok($$ update public.consultations set doctor_id = (select other from u) where id = (select c_draft from r) $$,
  'P0001', 'NOT_ALLOWED', 'consultation author cannot change');
select throws_ok($$ update public.consultations set pregnancy_id = (select preg from t2) where id = (select c_draft from r) $$,
  'P0001', 'NOT_ALLOWED', 'consultation cannot move to another pregnancy');
select is(tests.affected($$ delete from public.consultations where id = (select c_draft from r) $$), 0, 'consultations cannot be deleted by doctors');
select is(tests.affected($$ update public.consultations set advice = 'hijack' where id = (select c_other from r) $$), 0,
  'primary cannot edit a consultation of another team');

-- private notes
select is(tests.affected($$ update public.consultation_private_notes set note = 'updated note' where consultation_id = (select c_draft from r) $$), 1,
  'primary updates a private note');
select is(tests.affected($$ delete from public.consultation_private_notes where consultation_id = (select c_draft from r) $$), 1,
  'primary deletes a private note');
select lives_ok($$ insert into public.consultation_private_notes (consultation_id, pregnancy_id, note)
  values ((select c_draft from r), (select preg from t), 'fresh note') $$, 'primary adds a private note');
select throws_ok($$ insert into public.consultation_private_notes (consultation_id, pregnancy_id, note)
  values ((select c_other from r), (select preg from t), 'wrong pregnancy') $$,
  'P0001', 'INVALID_INPUT', 'a private note must match its consultation pregnancy');

-- prescription items
select lives_ok($$ insert into public.prescription_items (consultation_id, pregnancy_id, drug_name, strength, frequency, duration_days, start_date)
  values ((select c_draft from r), (select preg from t), 'Calcium carbonate', '500 mg', '1-0-1', 30, current_date) $$,
  'primary adds a prescription row');
select is((select end_date from public.prescription_items where drug_name = 'Calcium carbonate' and pregnancy_id = (select preg from t)),
  current_date + 29, 'end_date = start_date + duration - 1');
select throws_ok($$ insert into public.prescription_items (consultation_id, pregnancy_id, drug_name)
  values ((select c_other from r), (select preg from t), 'Wrong') $$,
  'P0001', 'INVALID_INPUT', 'a prescription row must match its consultation pregnancy');
select is(tests.affected($$ update public.prescription_items set stopped_at = now(), instructions = 'stopped' where id = (select rx_draft from r) $$), 1,
  'primary stops a prescription row');
select is(tests.affected($$ delete from public.prescription_items where id = (select rx_draft from r) $$), 1,
  'primary deletes a prescription row');

-- reports and report files
select lives_ok($$ insert into public.reports (id, pregnancy_id, type, title, report_date, uploaded_by)
  values (gen_random_uuid(), (select preg from t), 'ultrasound', 'Growth scan', current_date, (select prim from u)) $$,
  'primary adds a report');
select throws_ok($$ insert into public.reports (pregnancy_id, type, uploaded_by)
  values ((select preg from t), 'blood', (select other from u)) $$,
  '42501', null, 'uploaded_by must be the caller');
select is(tests.affected($$ update public.reports set doctor_comment = 'looks fine' where id = (select rep from r) $$), 1,
  'primary comments on a report');
select lives_ok($$ insert into public.report_files (report_id, storage_path, mime_type, page_no, size_bytes)
  values ((select rep from r), 'p/t/rep/f2.jpg', 'image/jpeg', 2, 1000) $$, 'primary adds a report page');
select is(tests.affected($$ delete from public.report_files where storage_path = 'p/t/rep/f2.jpg' $$), 1, 'primary deletes a report page');
select is(tests.affected($$ delete from public.reports where id = (select rep from r) $$), 0, 'reports have no hard delete');
select is(tests.affected($$ update public.reports set deleted_at = now() where id = (select rep from r) $$), 1, 'primary soft-deletes a report');
select tests.login_as((select pat from u));
select is((select count(*)::int from public.reports where id = (select rep from r)), 0, 'a soft-deleted report disappears for the patient');
select tests.login_as((select prim from u));
select is(tests.affected($$ update public.reports set deleted_at = null where id = (select rep from r) $$), 1, 'primary restores the report');

-- lab results
select lives_ok($$ insert into public.lab_results (report_id, pregnancy_id, test_code, value_num, unit, source, observed_on)
  values ((select rep from r), (select preg from t), 'FBS', 88, 'mg/dL', 'manual', current_date) $$, 'primary enters a manual lab value');
select throws_ok($$ insert into public.lab_results (report_id, pregnancy_id, test_code, value_num, source)
  values ((select rep from r), (select preg from t), 'FBS', 90, 'ai_extracted') $$,
  '42501', null, 'doctors cannot insert AI-sourced values');
select is(tests.affected($$ update public.lab_results set value_num = 10.9, verified = true, verified_by = (select other from u) where id = (select lab_un from r) $$), 1,
  'primary corrects and verifies a value');
select is((select verified_by from public.lab_results where id = (select lab_un from r)), (select prim from u),
  'verified_by is forced to the verifying doctor');
select is(tests.affected($$ delete from public.lab_results where id = (select lab_ver from r) $$), 0, 'a verified value cannot be deleted by a doctor');
select is(tests.affected($$ delete from public.lab_results where test_code = 'FBS' and not verified $$), 1, 'primary deletes an unverified value');
select throws_ok($$ insert into public.lab_results (report_id, pregnancy_id, test_code, value_num, source)
  values ((select rep_other from r), (select preg from t), 'HB', 1, 'manual') $$,
  'P0001', 'INVALID_INPUT', 'a lab result must match its report pregnancy (rep_other is invisible to prim)');

-- apply_visit_template is covered in doctor_03.

-- ================================================================ backup doctor: allowed too
select tests.login_as((select backup from u));
select is(tests.affected($$ update public.pregnancies set risk_level = 'moderate' where id = (select preg from t) $$), 1, 'backup updates pregnancy');
select is(tests.affected($$ update public.patients set allergies = array['Sulfa'] where id = (select pt from ids) $$), 1, 'backup updates medical fields');
select lives_ok($$ insert into public.visits (pregnancy_id, seq, target_week, title, is_extra, reason_added, added_by)
  values ((select preg from t), 96, 26, 'Backup extra', true, 'Review', (select backup from u)) $$, 'backup adds an extra visit');
select is(tests.affected($$ update public.visits set status = 'cancelled' where pregnancy_id = (select preg from t) and seq = 96 $$), 1, 'backup cancels a visit');
select lives_ok($$ insert into public.consultations (pregnancy_id, doctor_id, advice) values ((select preg from t), (select backup from u), 'cover visit') $$,
  'backup creates a consultation');
select is(tests.affected($$ update public.consultations set advice = 'edited by backup' where id = (select c_draft from r) $$), 1,
  'backup edits the primary''s consultation');
select is(tests.affected($$ update public.consultation_private_notes set note = 'backup note' where consultation_id = (select c_draft from r) $$), 1, 'backup edits a private note');
select lives_ok($$ insert into public.prescription_items (consultation_id, pregnancy_id, drug_name) values ((select c_draft from r), (select preg from t), 'Backup drug') $$,
  'backup adds a prescription row');
select lives_ok($$ insert into public.reports (pregnancy_id, type, uploaded_by) values ((select preg from t), 'urine', (select backup from u)) $$, 'backup adds a report');
select lives_ok($$ insert into public.report_files (report_id, storage_path, mime_type) values ((select rep from r), 'p/t/rep/f3.png', 'image/png') $$, 'backup adds a report page');
select lives_ok($$ insert into public.lab_results (report_id, pregnancy_id, test_code, value_num, source) values ((select rep from r), (select preg from t), 'HB', 12, 'manual') $$,
  'backup enters a lab value');
-- guards that need a doctor on BOTH teams (backup is on t and t2)
select throws_ok($$ insert into public.prescription_items (consultation_id, pregnancy_id, drug_name) values ((select c_draft from r), (select preg from t2), 'Mismatch') $$,
  'P0001', 'INVALID_INPUT', 'prescription row cannot mix pregnancies');
select throws_ok($$ insert into public.lab_results (report_id, pregnancy_id, test_code, value_num, source) values ((select rep from r), (select preg from t2), 'HB', 1, 'manual') $$,
  'P0001', 'INVALID_INPUT', 'lab result cannot mix report and pregnancy');
select throws_ok($$ insert into public.reports (pregnancy_id, consultation_id, type, uploaded_by) values ((select preg from t2), (select c_draft from r), 'blood', (select backup from u)) $$,
  'P0001', 'INVALID_INPUT', 'report cannot attach a consultation of another pregnancy');
select throws_ok($$ update public.reports set pregnancy_id = (select preg from t2) where id = (select rep from r) $$,
  'P0001', 'NOT_ALLOWED', 'report cannot move to another pregnancy');

-- ================================================================ doctor NOT on the care team: zero rows
select tests.login_as((select other from u));
select is((select count(*)::int from public.pregnancies where id = (select preg from t)), 0, 'outsider: no pregnancy');
select is((select count(*)::int from public.patients where id = (select pt from ids)), 0, 'outsider: no patient');
select is((select count(*)::int from public.consultations where pregnancy_id = (select preg from t)), 0, 'outsider: no consultations');
select is((select count(*)::int from public.consultation_private_notes where pregnancy_id = (select preg from t)), 0, 'outsider: no private notes');
select is((select count(*)::int from public.prescription_items where pregnancy_id = (select preg from t)), 0, 'outsider: no prescriptions');
select is((select count(*)::int from public.reports where pregnancy_id = (select preg from t)), 0, 'outsider: no reports');
select is((select count(*)::int from public.report_files), 0, 'outsider: no report files');
select is((select count(*)::int from public.lab_results where pregnancy_id = (select preg from t)), 0, 'outsider: no lab results');
select is(tests.affected($$ update public.pregnancies set risk_level = 'low' where id = (select preg from t) $$), 0, 'outsider cannot update the pregnancy');
select is(tests.affected($$ update public.patients set allergies = array['x'] where id = (select pt from ids) $$), 0, 'outsider cannot update the patient');
select is(tests.affected($$ update public.visits set status = 'skipped' where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot update visits');
select is(tests.affected($$ delete from public.visits where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot delete visits');
select is(tests.affected($$ update public.consultations set advice = 'x' where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot update consultations');
select is(tests.affected($$ update public.consultation_private_notes set note = 'x' where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot update private notes');
select is(tests.affected($$ delete from public.consultation_private_notes where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot delete private notes');
select is(tests.affected($$ update public.prescription_items set instructions = 'x' where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot update prescriptions');
select is(tests.affected($$ delete from public.prescription_items where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot delete prescriptions');
select is(tests.affected($$ update public.reports set doctor_comment = 'x' where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot update reports');
select is(tests.affected($$ delete from public.report_files where report_id = (select rep from r) $$), 0, 'outsider cannot delete report files');
select is(tests.affected($$ update public.lab_results set value_num = 1 where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot update lab results');
select is(tests.affected($$ delete from public.lab_results where pregnancy_id = (select preg from t) $$), 0, 'outsider cannot delete lab results');
select throws_ok($$ insert into public.visits (pregnancy_id, seq, target_week, title, is_extra, added_by) values ((select preg from t), 90, 20, 'x', true, (select other from u)) $$,
  '42501', null, 'outsider cannot add visits');
select throws_ok($$ insert into public.consultations (pregnancy_id, doctor_id) values ((select preg from t), (select other from u)) $$,
  '42501', null, 'outsider cannot create consultations');
select throws_ok($$ insert into public.consultation_private_notes (consultation_id, pregnancy_id, note) values ((select c_draft from r), (select preg from t), 'x') $$,
  'P0001', 'INVALID_INPUT', 'outsider cannot add private notes (consultation is invisible)');
select throws_ok($$ insert into public.prescription_items (consultation_id, pregnancy_id, drug_name) values ((select c_draft from r), (select preg from t), 'x') $$,
  'P0001', 'INVALID_INPUT', 'outsider cannot add prescriptions (consultation is invisible)');
select throws_ok($$ insert into public.reports (pregnancy_id, type, uploaded_by) values ((select preg from t), 'blood', (select other from u)) $$,
  '42501', null, 'outsider cannot add reports');
select throws_ok($$ insert into public.report_files (report_id, storage_path, mime_type) values ((select rep from r), 'p/t/rep/evil.png', 'image/png') $$,
  '42501', null, 'outsider cannot add report files');
select throws_ok($$ insert into public.lab_results (report_id, pregnancy_id, test_code, value_num, source) values (null, (select preg from t), 'HB', 1, 'manual') $$,
  '42501', null, 'outsider cannot add lab results');
select tests.login_as((select prim from u));
select is(tests.affected($$ update public.consultations set advice = 'x' where id = (select c_other from r) $$), 0, 'the primary of t is an outsider for t2 (consultation)');
select is(tests.affected($$ update public.lab_results set value_num = 1 where id = (select lab_other from r) $$), 0, 'the primary of t is an outsider for t2 (lab result)');

-- ================================================================ receptionist
select tests.login_as((select desk from u));
select is(tests.affected($$ update public.pregnancies set risk_level = 'low' where id = (select preg from t) $$), 0, 'receptionist cannot update pregnancy');
select is(tests.affected($$ update public.visits set status = 'skipped' where pregnancy_id = (select preg from t) $$), 0, 'receptionist cannot update visits');
select throws_ok($$ insert into public.consultations (pregnancy_id, doctor_id) values ((select preg from t), (select desk from u)) $$,
  '42501', null, 'receptionist cannot create consultations');
select throws_ok($$ insert into public.reports (pregnancy_id, type, uploaded_by) values ((select preg from t), 'blood', (select desk from u)) $$,
  '42501', null, 'receptionist cannot add reports');
select throws_ok($$ insert into public.lab_results (pregnancy_id, test_code, value_num, source) values ((select preg from t), 'HB', 1, 'manual') $$,
  '42501', null, 'receptionist cannot add lab results');
select throws_ok($$ insert into public.prescription_items (consultation_id, pregnancy_id, drug_name) values ((select c_draft from r), (select preg from t), 'x') $$,
  '42501', null, 'receptionist cannot add prescriptions');

-- ================================================================ patient
select tests.login_as((select pat from u));
select is(tests.affected($$ update public.pregnancies set risk_level = 'low' where id = (select preg from t) $$), 0, 'patient cannot update her pregnancy');
select is(tests.affected($$ update public.visits set status = 'skipped' where pregnancy_id = (select preg from t) $$), 0, 'patient cannot update visits');
select is(tests.affected($$ update public.consultations set advice = 'x' where pregnancy_id = (select preg from t) $$), 0, 'patient cannot edit consultations');
select is(tests.affected($$ update public.prescription_items set instructions = 'x' where pregnancy_id = (select preg from t) $$), 0, 'patient cannot edit prescriptions');
select is(tests.affected($$ update public.reports set doctor_comment = 'x' where pregnancy_id = (select preg from t) $$), 0, 'patient cannot edit reports');
select is(tests.affected($$ update public.lab_results set value_num = 1 where pregnancy_id = (select preg from t) $$), 0, 'patient cannot edit lab results');
select throws_ok($$ insert into public.consultations (pregnancy_id, doctor_id) values ((select preg from t), (select pat from u)) $$,
  '42501', null, 'patient cannot create consultations');
select throws_ok($$ insert into public.lab_results (pregnancy_id, test_code, value_num, source) values ((select preg from t), 'HB', 1, 'manual') $$,
  '42501', null, 'patient cannot add lab results');

-- ================================================================ companion
select tests.login_as((select comp from u));
select is(tests.affected($$ update public.consultations set advice = 'x' where pregnancy_id = (select preg from t) $$), 0, 'companion cannot edit consultations');
select is(tests.affected($$ update public.reports set doctor_comment = 'x' where pregnancy_id = (select preg from t) $$), 0, 'companion cannot edit reports');
select throws_ok($$ insert into public.reports (pregnancy_id, type, uploaded_by) values ((select preg from t), 'blood', (select comp from u)) $$,
  '42501', null, 'companion cannot add reports');
select throws_ok($$ insert into public.prescription_items (consultation_id, pregnancy_id, drug_name) values ((select c_pub from r), (select preg from t), 'x') $$,
  '42501', null, 'companion cannot add prescriptions');

-- ================================================================ publishing + removed backup
select tests.login_as((select prim from u));
select is(tests.affected($$ update public.consultations set published_at = now() where id = (select c_draft from r) $$), 1, 'primary publishes a consultation');
select tests.login_as((select pat from u));
select is((select count(*)::int from public.consultations where id = (select c_draft from r)), 1, 'patient now sees the published consultation');
select is((select count(*)::int from public.consultation_private_notes), 0, 'but still never the private note');
select tests.logout();
update public.care_team set removed_at = now() where doctor_id = (select backup from u) and pregnancy_id = (select preg from t);
select tests.login_as((select backup from u));
select is(tests.affected($$ update public.pregnancies set risk_level = 'low' where id = (select preg from t) $$), 0, 'removed backup cannot update the pregnancy');
select is(tests.affected($$ update public.consultations set advice = 'x' where id = (select c_draft from r) $$), 0, 'removed backup cannot edit consultations');
select throws_ok($$ insert into public.consultations (pregnancy_id, doctor_id) values ((select preg from t), (select backup from u)) $$,
  '42501', null, 'removed backup cannot create consultations');
select throws_ok($$ insert into public.lab_results (pregnancy_id, test_code, value_num, source) values ((select preg from t), 'HB', 1, 'manual') $$,
  '42501', null, 'removed backup cannot add lab results');
select is((select count(*)::int from public.consultations where pregnancy_id = (select preg from t)), 0, 'removed backup cannot read consultations either');
select is((select count(*)::int from public.pregnancies where id = (select preg from t2)), 1, 'removed backup keeps access to the team she is still on');

-- ================================================================ audit
select tests.logout();
select ok((select count(*) from public.audit_log where table_name = 'consultations' and action = 'update' and actor_id = (select prim from u)) >= 1,
  'doctor writes are audit-logged with the actor');

select * from finish();
rollback;
