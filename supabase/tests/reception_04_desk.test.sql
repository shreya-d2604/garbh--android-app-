-- Front desk: verify_patient, merge_patients, register_patient, mark_visit_contacted, next_mrn,
-- and the receptionist's update policy on patients.
begin;
\ir helpers/setup.psql
\ir helpers/reception.psql
select plan(108);

create temp table u as select
  tests.create_user('doc@x.test', 'doctor')        as doc,
  tests.create_user('doc2@x.test', 'doctor')       as doc2,
  tests.create_user('desk@x.test', 'receptionist') as desk,
  tests.create_user('admin@x.test', 'admin')       as admin,
  tests.create_user('comp@x.test', 'companion')    as comp,
  tests.create_user('comp2@x.test', 'companion')   as comp2,
  tests.create_user('n1@x.test', 'patient')        as n1,   -- plain verification
  tests.create_user('n2@x.test', 'patient')        as n2,   -- verification by admin
  tests.create_user('n3@x.test', 'patient')        as n3,   -- MRN already taken
  tests.create_user('m1@x.test', 'patient')        as m1,   -- merged into a desk record that has an active pregnancy
  tests.create_user('m2@x.test', 'patient')        as m2,   -- merged into a desk record without a pregnancy
  tests.create_user('m3@x.test', 'patient')        as m3,   -- target already has an account
  tests.create_user('m4@x.test', 'patient')        as m4,   -- merge_patients by reception
  tests.create_user('t3@x.test', 'patient')        as t3,   -- owner of the target in the "both have accounts" case
  tests.create_user('vp@x.test', 'patient')        as vp;   -- an ordinary verified patient
create temp table pr as select
  tests.rc_app_patient((select n1 from u), 'N One')    as n1,
  tests.rc_app_patient((select n2 from u), 'N Two')    as n2,
  tests.rc_app_patient((select n3 from u), 'N Three')  as n3,
  tests.rc_app_patient((select m1 from u), 'M One')    as m1,
  tests.rc_app_patient((select m2 from u), 'M Two')    as m2,
  tests.rc_app_patient((select m3 from u), 'M Three')  as m3,
  tests.rc_app_patient((select m4 from u), 'M Four')   as m4,
  tests.create_pregnancy(null, (select doc from u), 12)            as d1,   -- desk target with an active pregnancy
  tests.create_pregnancy(null, (select doc from u), 12)            as d4,
  tests.create_pregnancy((select t3 from u), (select doc from u), 12) as d3,   -- desk target with an account
  tests.create_pregnancy((select vp from u), (select doc from u), 12) as vp,
  tests.create_pregnancy(null, (select doc from u), 12)            as ad;   -- verified desk record merged by the admin
create temp table pt as select
  tests.rc_patient_of((select n1 from pr)) as n1,   tests.rc_patient_of((select n2 from pr)) as n2,
  tests.rc_patient_of((select n3 from pr)) as n3,   tests.rc_patient_of((select m1 from pr)) as m1,
  tests.rc_patient_of((select m2 from pr)) as m2,   tests.rc_patient_of((select m3 from pr)) as m3,
  tests.rc_patient_of((select m4 from pr)) as m4,   tests.rc_patient_of((select d1 from pr)) as d1,
  tests.rc_patient_of((select d4 from pr)) as d4,   tests.rc_patient_of((select d3 from pr)) as d3,
  tests.rc_patient_of((select vp from pr)) as vp,   tests.rc_patient_of((select ad from pr)) as ad,
  gen_random_uuid() as d2;   -- desk target without any pregnancy (inserted below)
grant select on u, pr, pt to authenticated;

insert into public.patients (id, full_name, registration_source, verified_at, mrn, created_by)
values ((select d2 from pt), 'Desk Two', 'desk', now(), 'D2-MRN', (select desk from u));
update public.patients set mrn = 'D1-MRN', allergies = array['Latex'], phone = '+919800000555' where id = (select d1 from pt);
update public.patients set mrn = 'D4-MRN' where id = (select d4 from pt);
update public.patients set mrn = 'D3-MRN' where id = (select d3 from pt);
update public.patients set mrn = 'TAKEN-1' where id = (select vp from pt);
update public.patients set allergies = array['Penicillin'] where id = (select m1 from pt);
-- M1 has a care team, an appointment and a companion link; D1 already has a link by the same companion
insert into public.care_team (pregnancy_id, doctor_id, care_role) values ((select m1 from pr), (select doc from u), 'primary');
select tests.rc_appt((select m1 from pr), (select doc from u), tests.rc_in(30));
insert into public.companion_links (patient_id, companion_user_id, relation, status, can_view_appointments) values
  ((select m1 from pt), (select comp from u), 'husband', 'approved', true),
  ((select m1 from pt), (select comp2 from u), 'mother', 'pending', false),
  ((select d1 from pt), (select comp from u), 'husband', 'approved', true);
-- clinical rows the desk must never see
insert into public.consultations (pregnancy_id, doctor_id, advice) values ((select vp from pr), (select doc from u), 'secret advice');

-- ================================================================= verify_patient
select tests.login_as((select desk from u));
select lives_ok($$ select public.verify_patient((select n1 from pt), 'GH-T-100') $$, 'reception verifies a self-registered patient');
select throws_ok($$ select public.verify_patient((select n1 from pt), 'GH-T-101') $$, 'INVALID_INPUT', 'an already verified patient cannot be verified again');
select throws_ok($$ select public.verify_patient((select n3 from pt), 'GH-T-100') $$, 'MRN_TAKEN', 'the MRN must be unique');
select throws_ok($$ select public.verify_patient((select n3 from pt), 'TAKEN-1') $$, 'MRN_TAKEN', 'the MRN of a seeded/other patient is taken too');
select throws_ok($$ select public.verify_patient((select n3 from pt), '   ') $$, 'INVALID_INPUT', 'a blank MRN is rejected');
select throws_ok($$ select public.verify_patient((select n3 from pt), null) $$, 'INVALID_INPUT', 'a null MRN is rejected');
select throws_ok($$ select public.verify_patient(gen_random_uuid(), 'GH-T-102') $$, 'NOT_FOUND', 'unknown patient');
select throws_ok($$ select public.verify_patient((select n3 from pt), 'GH-T-103', (select n3 from pt)) $$, 'INVALID_INPUT', 'cannot merge a record into itself');
select tests.logout();
select is((select verified_by from public.patients where id = (select n1 from pt)), (select desk from u), 'verified_by is the receptionist');
select is((select mrn from public.patients where id = (select n1 from pt)), 'GH-T-100', 'the MRN is stored');
select ok((select verified_at is not null and is_verified from public.patients where id = (select n1 from pt)), 'verified_at is set');
select is((select mrn from public.patients where id = (select n3 from pt)), null, 'failed verifications leave no MRN behind');
select tests.login_as((select n1 from u));
select ok((select is_verified from public.patients limit 1), 'the patient sees herself as verified');

select tests.login_as((select admin from u));
select lives_ok($$ select public.verify_patient((select n2 from pt), 'GH-T-200') $$, 'admin can verify');
select tests.login_as((select doc from u));
select throws_ok($$ select public.verify_patient((select n3 from pt), 'GH-T-300') $$, 'NOT_ALLOWED', 'doctors cannot verify');
select tests.login_as((select vp from u));
select throws_ok($$ select public.verify_patient((select n3 from pt), 'GH-T-300') $$, 'NOT_ALLOWED', 'patients cannot verify');
select tests.login_as((select comp from u));
select throws_ok($$ select public.verify_patient((select n3 from pt), 'GH-T-300') $$, 'NOT_ALLOWED', 'companions cannot verify');
select tests.logout();
select throws_ok($$ select public.verify_patient((select n3 from pt), 'GH-T-300') $$, 'NOT_AUTHENTICATED', 'no session');
select set_config('role', 'anon', true);
select throws_ok($$ select public.verify_patient(gen_random_uuid(), 'x') $$, '42501', null, 'anon cannot execute verify_patient');
select tests.logout();

-- ================================================================= verify with merge
select tests.login_as((select desk from u));
select throws_ok($$ select public.verify_patient((select m1 from pt), 'OTHER-MRN', (select d1 from pt)) $$, 'INVALID_INPUT', 'merge: the target already has a different MRN');
select throws_ok($$ select public.verify_patient((select m1 from pt), 'TAKEN-1', (select d1 from pt)) $$, 'INVALID_INPUT', 'merge: the target MRN wins over any other MRN');
select throws_ok($$ select public.verify_patient((select m1 from pt), 'D1-MRN', gen_random_uuid()) $$, 'NOT_FOUND', 'merge: unknown target');
select lives_ok($$ select public.verify_patient((select m1 from pt), 'D1-MRN', (select d1 from pt)) $$, 'reception verifies an app record by merging it into a desk record');
select tests.logout();
select ok((select deleted_at is not null and user_id is null from public.patients where id = (select m1 from pt)), 'the source is soft-deleted and released its account');
select is((select user_id from public.patients where id = (select d1 from pt)), (select m1 from u), 'the target now owns the app account');
select ok((select verified_at is not null and verified_by = (select desk from u) and mrn = 'D1-MRN' from public.patients where id = (select d1 from pt)), 'the target is verified with its MRN');
select is((select status::text from public.pregnancies where id = (select m1 from pr)), 'closed', 'the source pregnancy is closed because the target has an active one');
select is((select patient_id from public.pregnancies where id = (select m1 from pr)), (select d1 from pt), 'and moved to the target (history kept)');
select is((select count(*)::int from public.appointments where pregnancy_id = (select m1 from pr) and patient_id = (select d1 from pt)), 1, 'appointments move to the target');
select is((select count(*)::int from public.companion_links where patient_id = (select d1 from pt) and companion_user_id = (select comp from u) and status = 'approved'), 1,
  'a duplicate companion link is not kept open twice');
select is((select status::text from public.companion_links where patient_id = (select d1 from pt) and companion_user_id = (select comp2 from u)), 'pending', 'other companion links move over');
select is((select count(*)::int from public.companion_links where patient_id = (select m1 from pt)), 0, 'the source has no links left');
select is((select array(select unnest(allergies) order by 1) from public.patients where id = (select d1 from pt)), array['Latex', 'Penicillin'], 'allergies from both records are kept');
select ok((select consent_data_at is not null and consent_ai_at is not null from public.patients where id = (select d1 from pt)), 'the app consent is carried over');
select tests.login_as((select m1 from u));
select is(public.my_patient_id(), (select d1 from pt), 'the app user now resolves to the merged record');
select tests.logout();

select tests.login_as((select desk from u));
select lives_ok($$ select public.verify_patient((select m2 from pt), 'D2-MRN', (select d2 from pt)) $$, 'merge into a desk record without a pregnancy');
select tests.logout();
select is((select status::text from public.pregnancies where id = (select m2 from pr)), 'active', 'the source pregnancy stays active when the target has none');
select is((select patient_id from public.pregnancies where id = (select m2 from pr)), (select d2 from pt), 'and belongs to the target');
select tests.login_as((select desk from u));
select throws_ok($$ select public.verify_patient((select m3 from pt), 'D3-MRN', (select d3 from pt)) $$, 'INVALID_INPUT', 'merge: both records already have an app account');
select throws_ok($$ select public.verify_patient((select vp from pt), 'TAKEN-1', (select d4 from pt)) $$, 'INVALID_INPUT', 'merge: a verified source is rejected');
select tests.logout();
select is((select deleted_at is null from public.patients where id = (select m3 from pt)), true, 'a rejected merge changes nothing');

-- ================================================================= merge_patients
select tests.login_as((select desk from u));
select lives_ok($$ select public.merge_patients((select m4 from pt), (select d4 from pt)) $$, 'reception merges an unverified app record');
select throws_ok($$ select public.merge_patients((select vp from pt), (select d4 from pt)) $$, 'NOT_ALLOWED', 'reception cannot merge a verified record');
select throws_ok($$ select public.merge_patients((select m3 from pt), (select m3 from pt)) $$, 'INVALID_INPUT', 'source and target must differ');
select throws_ok($$ select public.merge_patients((select m4 from pt), (select d4 from pt)) $$, 'NOT_FOUND', 'a deleted source is not found');
select throws_ok($$ select public.merge_patients((select m3 from pt), gen_random_uuid()) $$, 'NOT_FOUND', 'unknown target');
select tests.login_as((select admin from u));
select lives_ok($$ select public.merge_patients((select ad from pt), (select d4 from pt)) $$, 'admin may merge any record');
select tests.login_as((select doc from u));
select throws_ok($$ select public.merge_patients((select m3 from pt), (select d4 from pt)) $$, 'NOT_ALLOWED', 'doctors cannot merge');
select tests.login_as((select vp from u));
select throws_ok($$ select public.merge_patients((select m3 from pt), (select d4 from pt)) $$, 'NOT_ALLOWED', 'patients cannot merge');
select tests.logout();
select set_config('role', 'anon', true);
select throws_ok($$ select public.merge_patients(gen_random_uuid(), gen_random_uuid()) $$, '42501', null, 'anon cannot execute merge_patients');
select tests.logout();

-- ================================================================= register_patient
create temp table reg as select jsonb_build_object(
  'full_name', 'Reg Ister', 'consent', true, 'lmp_date', (public.hospital_today() - 70)::text,
  'primary_doctor', (select doc from u), 'email', 'Invite@X.test', 'phone', '+919811111111',
  'dob', '1995-05-05', 'blood_group', 'O-', 'allergies', jsonb_build_array('Latex'), 'gravida', 1, 'para', 0, 'abortus', 0, 'living', 0) as d;
grant select on reg to authenticated;

select tests.login_as((select desk from u));
select lives_ok($$ create temp table r1 as select public.register_patient((select d from reg)) as id $$, 'reception registers a walk-in');
select lives_ok($$ create temp table r2 as select public.register_patient((select d from reg) || '{"full_name":"Reg Two","email":"r2@x.test"}') as id $$, 'a second registration');
select tests.logout();
select ok((select registration_source = 'desk' and verified_at is not null and verified_by = (select desk from u) and created_by = (select desk from u)
           from public.patients where id = (select id from r1)), 'desk patient: verified on creation, created_by the receptionist');
select ok((select mrn ~ '^GH-[0-9]{4,}$' from public.patients where id = (select id from r1)), 'the MRN is auto-assigned (GH-nnnn)');
select is((select substr(mrn, 4)::int from public.patients where id = (select id from r2)) - (select substr(mrn, 4)::int from public.patients where id = (select id from r1)), 1,
  'auto MRNs increase by one');
select ok((select consent_ai_at is not null and consent_data_at is not null from public.patients where id = (select id from r1)), 'consent is recorded');
select is((select email from public.patients where id = (select id from r1)), 'invite@x.test', 'the email is stored lower-case (app invite)');
select ok((select rh_negative and blood_group = 'O-' and allergies = array['Latex'] and dob = '1995-05-05' from public.patients where id = (select id from r1)), 'demographics are stored, Rh derived from the blood group');
select ok((select lmp_source = 'clinician' and status = 'active' and lmp_date = public.hospital_today() - 70 and gravida = 1 from public.pregnancies where patient_id = (select id from r1)),
  'active pregnancy with lmp_source = clinician');
select is((select count(*)::int from public.care_team ct join public.pregnancies p on p.id = ct.pregnancy_id
           where p.patient_id = (select id from r1) and ct.care_role = 'primary' and ct.doctor_id = (select doc from u) and ct.added_by = (select desk from u)), 1,
  'the chosen doctor is the primary');
select is((select count(*)::int from public.visits v join public.pregnancies p on p.id = v.pregnancy_id where p.patient_id = (select id from r1)),
  (select count(*)::int from public.visit_templates where schedule = 'standard' and is_active), 'the visit plan is generated');
select lives_ok($$ select tests.create_user('invite@x.test') $$, 'the patient later signs in with the desk email');
select is((select role::text from public.profiles where email = 'invite@x.test'), 'patient', 'and is linked as a patient automatically (app invite)');
select ok((select user_id is not null from public.patients where id = (select id from r1)), 'the desk record now has the account');

select tests.login_as((select desk from u));
select lives_ok($$ select public.register_patient((select d from reg) || ('{"full_name":"Manual Mrn","email":null,"mrn":"MAN-1","lmp_date":null,"edd_date":"' || (public.hospital_today() + 210)::text || '"}')::jsonb) $$,
  'a manual MRN and an EDD instead of an LMP');
select throws_ok($$ select public.register_patient((select d from reg) || '{"full_name":"Dup Mrn","mrn":"MAN-1"}') $$, 'MRN_TAKEN', 'a duplicate manual MRN');
select throws_ok($$ select public.register_patient((select d from reg) - 'full_name') $$, 'INVALID_INPUT', 'a name is required');
select throws_ok($$ select public.register_patient((select d from reg) - 'consent') $$, 'CONSENT_REQUIRED', 'consent is required');
select throws_ok($$ select public.register_patient((select d from reg) || '{"consent":false}') $$, 'CONSENT_REQUIRED', 'consent must be true');
select throws_ok($$ select public.register_patient((select d from reg) || ('{"lmp_date":"' || (public.hospital_today() + 3)::text || '"}')::jsonb) $$, 'INVALID_INPUT', 'LMP in the future');
select throws_ok($$ select public.register_patient((select d from reg) || ('{"lmp_date":"' || (public.hospital_today() - 301)::text || '"}')::jsonb) $$, 'INVALID_INPUT', 'LMP more than 300 days ago');
select throws_ok($$ select public.register_patient((select d from reg) - 'lmp_date') $$, 'INVALID_INPUT', 'an LMP or EDD is required');
select throws_ok($$ select public.register_patient((select d from reg) || '{"lmp_date":"not-a-date"}') $$, 'INVALID_INPUT', 'a malformed date');
select throws_ok($$ select public.register_patient((select d from reg) - 'primary_doctor') $$, 'INVALID_INPUT', 'a primary doctor is required');
select throws_ok($$ select public.register_patient((select d from reg) || ('{"primary_doctor":"' || (select desk from u) || '"}')::jsonb) $$, 'INVALID_INPUT', 'the primary doctor must be a doctor');
select throws_ok($$ select public.register_patient((select d from reg) || '{"email":"nope"}') $$, 'INVALID_INPUT', 'a malformed email');
select throws_ok($$ select public.register_patient((select d from reg) || '{"blood_group":"Z+"}') $$, 'INVALID_INPUT', 'an unknown blood group');
select throws_ok($$ select public.register_patient((select d from reg) || '{"gravida":-1}') $$, 'INVALID_INPUT', 'a negative obstetric count');
select throws_ok($$ select public.register_patient('[]'::jsonb) $$, 'INVALID_INPUT', 'details must be an object');
select tests.logout();
select is((select count(*)::int from public.patients where full_name in ('Dup Mrn')), 0, 'failed registrations leave no partial rows');
select tests.login_as((select admin from u));
select lives_ok($$ select public.register_patient((select d from reg) || '{"full_name":"By Admin","email":"adm@x.test"}') $$, 'admin can register too');
select tests.login_as((select doc from u));
select throws_ok($$ select public.register_patient((select d from reg)) $$, 'NOT_ALLOWED', 'doctors cannot register patients');
select tests.login_as((select vp from u));
select throws_ok($$ select public.register_patient((select d from reg)) $$, 'NOT_ALLOWED', 'patients cannot register patients');
select tests.logout();
select throws_ok($$ select public.register_patient((select d from reg)) $$, 'NOT_AUTHENTICATED', 'no session');
select set_config('role', 'anon', true);
select throws_ok($$ select public.register_patient('{}') $$, '42501', null, 'anon cannot execute register_patient');
select tests.logout();

-- ================================================================= next_mrn, mark_visit_contacted
create temp table vis as select (select id from public.visits where pregnancy_id = (select vp from pr) and seq = 3) as v;
grant select on vis to authenticated;
select tests.login_as((select desk from u));
select ok(public.next_mrn() ~ '^GH-[0-9]{4,}$', 'next_mrn suggests the next hospital number');
select lives_ok($$ select public.mark_visit_contacted((select v from vis), 'Called, will come next week') $$, 'reception marks a visit as contacted');
select throws_ok($$ select public.mark_visit_contacted(gen_random_uuid(), 'x') $$, 'NOT_FOUND', 'unknown visit');
select throws_ok($$ select public.mark_visit_contacted((select v from vis), repeat('x', 501)) $$, 'INVALID_INPUT', 'a long note is rejected');
select tests.logout();
select ok((select contacted_at is not null and contact_note = 'Called, will come next week' from public.visits where id = (select v from vis)), 'contacted_at and the note are stored');
select tests.login_as((select vp from u));
select throws_ok($$ select public.mark_visit_contacted((select v from vis), 'x') $$, 'NOT_ALLOWED', 'patients cannot mark visits contacted');
select throws_ok($$ select public.next_mrn() $$, 'NOT_ALLOWED', 'patients cannot ask for MRN suggestions');
select tests.login_as((select doc from u));
select throws_ok($$ select public.mark_visit_contacted((select v from vis), 'x') $$, 'NOT_ALLOWED', 'doctors cannot mark visits contacted');
select tests.logout();
select set_config('role', 'anon', true);
select throws_ok($$ select public.mark_visit_contacted(gen_random_uuid(), 'x') $$, '42501', null, 'anon cannot execute mark_visit_contacted');
select tests.logout();

-- ================================================================= patients_reception_update + guard trigger
select tests.login_as((select desk from u));
select lives_ok($$ update public.patients set phone = '+919822222222', address = 'New address', full_name = 'Vp Renamed', dob = '1990-01-01',
                      blood_group = 'A+', allergies = array['Dust'], emergency_contact = 'Mother' where id = (select vp from pt) $$,
  'reception edits demographics');
select throws_ok($$ update public.patients set mrn = 'HACK' where id = (select vp from pt) $$, 'NOT_ALLOWED', 'reception cannot change the MRN directly');
select throws_ok($$ update public.patients set verified_at = null where id = (select vp from pt) $$, 'NOT_ALLOWED', 'reception cannot un-verify');
select throws_ok($$ update public.patients set verified_by = (select desk from u) where id = (select vp from pt) $$, 'NOT_ALLOWED', 'reception cannot change verified_by');
select throws_ok($$ update public.patients set user_id = (select n3 from u) where id = (select vp from pt) $$, 'NOT_ALLOWED', 'reception cannot relink accounts');
select throws_ok($$ update public.patients set deleted_at = now() where id = (select vp from pt) $$, 'NOT_ALLOWED', 'reception cannot soft-delete');
select throws_ok($$ update public.patients set registration_source = 'app' where id = (select vp from pt) $$, 'NOT_ALLOWED', 'reception cannot change the registration source');
select throws_ok($$ update public.patients set consent_data_at = now() where id = (select vp from pt) $$, 'NOT_ALLOWED', 'reception cannot forge consent');
select is_empty($$ delete from public.patients where id = (select vp from pt) returning 1 $$, 'reception cannot delete patients');
select throws_ok($$ insert into public.patients (full_name, registration_source) values ('Direct Insert', 'desk') $$, '42501', null, 'reception cannot insert patients directly');
select is((select count(*)::int from public.consultations) + (select count(*)::int from public.ai_summaries), 0, 'reception sees no clinical data');
select tests.login_as((select vp from u));
select is_empty($$ update public.patients set phone = '+910000000000' where id = (select d1 from pt) returning 1 $$, 'a patient cannot edit someone else');
select tests.login_as((select comp from u));
select is_empty($$ update public.patients set phone = '+910000000000' where id = (select d1 from pt) returning 1 $$, 'a companion cannot edit patients');
select tests.logout();
select is((select phone from public.patients where id = (select vp from pt)), '+919822222222', 'the permitted edit was saved');

select * from finish();
rollback;
