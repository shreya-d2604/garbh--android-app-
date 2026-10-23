-- Head post-merge fixes (migration 20261030000100): visit_contacts privacy, RLS gaps, the
-- app_metadata role trigger, backup self-removal, and admin delete in the `reports` bucket.
begin;
\ir helpers/setup.psql
\ir helpers/doctor.psql
select plan(34);

create temp table u as select
  tests.create_user('h4-admin@t.test', 'admin')         as admin,
  tests.create_user('h4-desk@t.test', 'receptionist')   as desk,
  tests.create_user('h4-doc@t.test', 'doctor')          as doc,
  tests.create_user('h4-backup@t.test', 'doctor')       as backup,
  tests.create_user('h4-backup2@t.test', 'doctor')      as backup2,
  tests.create_user('h4-off@t.test', 'doctor')          as off,
  tests.create_user('h4-pat@t.test', 'patient')         as pat,
  tests.create_user('h4-comp@t.test', 'companion')      as comp,
  tests.create_user('h4-new@t.test')                    as fresh;
create temp table fx as select tests.create_pregnancy((select pat from u), (select doc from u), 20) as preg;
create temp table ids as select
  (select patient_id from public.pregnancies where id = (select preg from fx)) as patient,
  (select id from public.visits where pregnancy_id = (select preg from fx) order by seq limit 1) as visit;
grant select on u, fx, ids to authenticated;

insert into public.care_team (pregnancy_id, doctor_id, care_role) values
  ((select preg from fx), (select backup from u), 'backup'),
  ((select preg from fx), (select backup2 from u), 'backup');
-- companion with journey + appointments + prescriptions, but NOT summaries
insert into public.companion_links (patient_id, companion_user_id, relation, status,
                                    can_view_journey, can_view_appointments, can_view_prescriptions)
  values ((select patient from ids), (select comp from u), 'husband', 'approved', true, true, true);
insert into public.consultations (id, pregnancy_id, doctor_id, advice, published_at) values
  ('c4000000-0000-4000-8000-000000000001', (select preg from fx), (select doc from u), 'rest', now()),
  ('c4000000-0000-4000-8000-000000000002', (select preg from fx), (select doc from u), 'draft', null);
insert into public.prescription_items (consultation_id, pregnancy_id, drug_name) values
  ('c4000000-0000-4000-8000-000000000001', (select preg from fx), 'Iron'),
  ('c4000000-0000-4000-8000-000000000002', (select preg from fx), 'Unpublished');
insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, status, booking_channel)
  values ((select patient from ids), (select preg from fx), (select backup from u),
          now() + interval '5 days', now() + interval '5 days 15 minutes', 'booked', 'reception');

-- ---------------------------------------------------------------- 1. visit_contacts
select hasnt_column('public', 'visits', 'contact_note', 'visits no longer carries the reception call note');
select hasnt_column('public', 'visits', 'contacted_at', 'visits no longer carries contacted_at');
select tests.login_as((select desk from u));
select lives_ok($$ select public.mark_visit_contacted((select visit from ids), 'Called, coming Friday') $$, 'reception marks a visit contacted');
select lives_ok($$ select public.mark_visit_contacted((select visit from ids), 'Called again') $$, 'and can update the note');
select is((select count(*)::int from public.visit_contacts where visit_id = (select visit from ids)), 1, 'reception reads the call note');
select is((select contact_note from public.visit_contacts where visit_id = (select visit from ids)), 'Called again', 'the latest note wins');
select tests.login_as((select admin from u));
select is((select count(*)::int from public.visit_contacts where visit_id = (select visit from ids)), 1, 'admin reads the call note');
select tests.login_as((select doc from u));
select is((select count(*)::int from public.visit_contacts where visit_id = (select visit from ids)), 1, 'care-team doctor reads the call note');
select tests.login_as((select off from u));
select is((select count(*)::int from public.visit_contacts), 0, 'doctor not on the care team sees zero call notes');
select tests.login_as((select pat from u));
select is((select count(*)::int from public.visit_contacts), 0, 'the patient never reads the reception call note');
select ok((select count(*) from public.visits where pregnancy_id = (select preg from fx)) > 0, 'the patient still reads her visits');
select throws_ok($$ select public.mark_visit_contacted((select visit from ids), 'x') $$, 'NOT_ALLOWED', 'patients cannot write call notes');
select tests.login_as((select comp from u));
select is((select count(*)::int from public.visit_contacts), 0, 'a companion never reads the reception call note');

-- ---------------------------------------------------------------- 2a. prescriptions-only companion
select is((select count(*)::int from public.prescription_items where pregnancy_id = (select preg from fx)), 1, 'companion with prescriptions (no summaries) sees the published item only');
select is((select count(*)::int from public.consultations where pregnancy_id = (select preg from fx)), 0, 'but still no consultations without summaries');

-- ---------------------------------------------------------------- 5c. backup leaves the team
select tests.login_as((select backup from u));
select is((select count(*)::int from public.appointments where pregnancy_id = (select preg from fx)), 1, 'backup sees the appointment she is the doctor of');
select tests.login_as((select backup2 from u));
select throws_ok(format($$ select public.remove_care_team_member(%L, %L) $$, (select preg from fx), (select backup from u)), 'PRIMARY_REQUIRED', 'a backup cannot remove another backup');
select tests.login_as((select off from u));
select throws_ok(format($$ select public.remove_care_team_member(%L, %L) $$, (select preg from fx), (select off from u)), 'PRIMARY_REQUIRED', 'a doctor not on the team cannot use self-removal');
select tests.login_as((select backup from u));
select lives_ok(format($$ select public.remove_care_team_member(%L, %L) $$, (select preg from fx), (select backup from u)), 'a backup leaves the care team herself');
select is((select count(*)::int from public.appointments where pregnancy_id = (select preg from fx)), 0, 'a removed doctor no longer reads appointments where she is the doctor');
select is((select count(*)::int from public.visits where pregnancy_id = (select preg from fx)), 0, 'nor the visits');
select tests.logout();
select is((select removed_by from public.care_team where pregnancy_id = (select preg from fx) and doctor_id = (select backup from u)), (select backup from u), 'removed_by is the doctor herself');
select is((select count(*)::int from public.notifications where user_id = (select doc from u) and type = 'care_team_changed'
           and body = 'A backup doctor has left a patient''s care team.'), 1, 'the primary is notified that the backup left');
select tests.login_as((select doc from u));
select throws_ok(format($$ select public.remove_care_team_member(%L, %L) $$, (select preg from fx), (select doc from u)), 'INVALID_INPUT', 'the primary cannot leave (hand over first)');
select lives_ok(format($$ select public.remove_care_team_member(%L, %L) $$, (select preg from fx), (select backup2 from u)), 'the primary still removes a backup');

-- ---------------------------------------------------------------- 2b. deactivated patient
select tests.logout();
update public.profiles set is_active = false where id = (select pat from u);
select tests.login_as((select pat from u));
select is((select count(*)::int from public.patients), 0, 'a deactivated patient cannot read her patients row');
select is(tests.affected($$ update public.profiles set full_name = 'X' where id = auth.uid() $$), 0, 'a deactivated user cannot edit her profile');
select is((select count(*)::int from public.profiles where id = auth.uid()), 1, 'but can read is_active for the deactivated notice');

-- ---------------------------------------------------------------- 3. role from app_metadata after insert
select tests.logout();
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"doctor"}' where id = (select fresh from u);
select is((select role::text from public.profiles where id = (select fresh from u)), 'doctor', 'app_metadata.role written after the insert reaches the profile');
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where id = (select fresh from u);
select is((select role::text from public.profiles where id = (select fresh from u)), 'doctor', 'a later app_metadata change never changes an existing role');
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"bogus"}' where id = (select pat from u);
select is((select role::text from public.profiles where id = (select pat from u)), 'patient', 'an unknown role value is ignored');

-- ---------------------------------------------------------------- 7. admin deletes report files
create temp table obj as select (select patient from ids) || '/' || (select preg from fx) || '/' || gen_random_uuid() || '/a.pdf' as name;
grant select on obj to authenticated;
insert into storage.objects (bucket_id, name) select 'reports', name from obj;
select set_config('storage.allow_delete_query', 'true', true);   -- what the Storage API sets
select tests.login_as((select off from u));
select is(tests.affected($$ delete from storage.objects where bucket_id = 'reports' and name = (select name from obj) $$), 0, 'a doctor off the care team cannot delete the file');
select tests.login_as((select pat from u));
select is(tests.affected($$ delete from storage.objects where bucket_id = 'reports' and name = (select name from obj) $$), 0, 'the patient cannot delete the file');
select tests.login_as((select admin from u));
select is(tests.affected($$ delete from storage.objects where bucket_id = 'reports' and name = (select name from obj) $$), 1, 'admin deletes the file (needed by hard delete)');

select * from finish();
rollback;
