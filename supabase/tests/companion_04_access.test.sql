-- What a companion can read, per permission, and that revoking / leaving / never-approved means
-- ZERO rows in every clinical table and in `patients` (RLS is from the foundation migration; this
-- file proves the RPC state changes feed it). Also: a doctor not on the care team sees nothing.
begin;
\ir helpers/setup.psql
select plan(21);

create temp table u as select
  tests.create_user('doc@x.test',     'doctor')    as doc,
  tests.create_user('docb@x.test',    'doctor')    as doc_b,
  tests.create_user('p1@x.test',      'patient')   as pat,
  tests.create_user('p2@x.test',      'patient')   as pat2,
  tests.create_user('full@x.test',    'companion') as c_full,
  tests.create_user('full2@x.test',   'companion') as c_full2,
  tests.create_user('jr@x.test',      'companion') as c_journey,
  tests.create_user('none@x.test',    'companion') as c_noperm,
  tests.create_user('pend@x.test',    'companion') as c_pending,
  tests.create_user('stranger@x.test','companion') as c_stranger;
create temp table preg as select
  tests.create_pregnancy((select pat from u),  (select doc from u), 24) as p1,
  tests.create_pregnancy((select pat2 from u), (select doc from u), 10) as p2;
create temp table pt as select
  (select patient_id from public.pregnancies where id = (select p1 from preg)) as p1;

-- clinical data for patient 1 (everything published / verified so only the link decides)
insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
  values ((select p1 from pt), (select p1 from preg), (select doc from u), now() + interval '1 day', now() + interval '1 day 15 minutes', 'reception');
insert into public.consultations (id, pregnancy_id, doctor_id, advice, published_at)
  values ('c0000000-0000-4000-8000-000000000001', (select p1 from preg), (select doc from u), 'rest', now());
insert into public.consultation_private_notes (consultation_id, pregnancy_id, note)
  values ('c0000000-0000-4000-8000-000000000001', (select p1 from preg), 'doctor only');
insert into public.prescription_items (consultation_id, pregnancy_id, drug_name)
  values ('c0000000-0000-4000-8000-000000000001', (select p1 from preg), 'Folic acid');
insert into public.reports (id, pregnancy_id, type, title, verified_at, verified_by)
  values ('e0000000-0000-4000-8000-000000000001', (select p1 from preg), 'blood', 'CBC', now(), (select doc from u));
insert into public.report_files (report_id, storage_path, mime_type)
  values ('e0000000-0000-4000-8000-000000000001', 'x/y/z/f.pdf', 'application/pdf');
insert into public.lab_results (report_id, pregnancy_id, raw_name, value_num, source, verified, verified_by)
  values ('e0000000-0000-4000-8000-000000000001', (select p1 from preg), 'Hb', 11.5, 'manual', true, (select doc from u));
insert into public.ai_summaries (pregnancy_id, source_type, status, final, reviewed_by, published_at)
  values ((select p1 from preg), 'report', 'published', '{"summary":{"headline":"ok"}}', (select doc from u), now());

-- links: all permissions / journey only / approved without permissions / still pending
insert into public.companion_links (patient_id, companion_user_id, relation, status,
  can_view_appointments, can_view_journey, can_view_summaries, can_view_reports, can_view_prescriptions) values
  ((select p1 from pt), (select c_full from u),    'husband', 'approved', true,  true,  true,  true,  true),
  ((select p1 from pt), (select c_full2 from u),   'mother',  'approved', true,  true,  true,  true,  true),
  ((select p1 from pt), (select c_journey from u), 'friend',  'approved', false, true,  false, false, false),
  ((select p1 from pt), (select c_noperm from u),  'sibling', 'approved', false, false, false, false, false);
insert into public.companion_links (patient_id, companion_user_id, relation, status)
  values ((select p1 from pt), (select c_pending from u), 'friend', 'pending');
create temp table link_ids as
  select companion_user_id as uid, id from public.companion_links;

-- one comma-separated row of visible counts, evaluated under the caller's RLS
create function tests.visible() returns text language sql as $$
  select concat_ws(',',
    (select count(*) from public.patients),
    (select count(*) from public.pregnancies),
    (select count(*) from public.care_team),
    (select count(*) from public.visits),
    (select count(*) from public.appointments),
    (select count(*) from public.consultations),
    (select count(*) from public.consultation_private_notes),
    (select count(*) from public.prescription_items),
    (select count(*) from public.reports),
    (select count(*) from public.report_files),
    (select count(*) from public.lab_results),
    (select count(*) from public.published_summaries),
    (select count(*) from public.ai_summaries)) $$;
create temp table expect as select
  (select count(*) from public.visits where pregnancy_id = (select p1 from preg)) as visits;
grant select on u, preg, pt, link_ids, expect to authenticated;
grant execute on function tests.visible() to authenticated;
--                        patients,preg,team,visits,appts,consult,notes,rx,reports,files,labs,summaries,ai
create temp table want as select
  format('1,1,1,%s,1,1,0,1,1,1,1,1,0', (select visits from expect)) as everything,
  format('1,1,0,%s,0,0,0,0,0,0,0,0,0', (select visits from expect)) as journey_only,
  '1,0,0,0,0,0,0,0,0,0,0,0,0' as name_only,
  '0,0,0,0,0,0,0,0,0,0,0,0,0' as nothing;
grant select on want to authenticated;

-- ---- baseline: the permission flags decide
select tests.login_as((select c_full from u));
select is(tests.visible(), (select everything from want), 'all permissions: patient + clinical data (never notes, never raw AI)');
select tests.login_as((select c_journey from u));
select is(tests.visible(), (select journey_only from want), 'journey only: pregnancy + visit plan, no appointments/care team/reports/prescriptions/summaries');
select tests.login_as((select c_noperm from u));
select is(tests.visible(), (select name_only from want), 'approved with no permissions: only the patient name row');
select tests.login_as((select c_pending from u));
select is(tests.visible(), (select nothing from want), 'pending request: zero rows everywhere');
select tests.login_as((select c_stranger from u));
select is(tests.visible(), (select nothing from want), 'a companion with no link: zero rows everywhere');

-- ---- permission changes take effect immediately
select tests.login_as((select pat from u));
select public.decide_companion_link((select id from link_ids where uid = (select c_journey from u)), true,
  '{"reports":true,"summaries":true}');
select tests.login_as((select c_journey from u));
select is(tests.visible(), format('1,0,0,0,0,1,0,0,1,1,1,1,0'), 'after the patient edits permissions: reports + summaries appear, journey disappears');
select tests.login_as((select pat from u));
select public.decide_companion_link((select id from link_ids where uid = (select c_journey from u)), true, '{}');
select tests.login_as((select c_journey from u));
select is(tests.visible(), (select name_only from want), 'switching everything off hides everything again');

-- ---- revoke: the patient ends the link
select tests.login_as((select c_full from u));
select is(tests.visible(), (select everything from want), 'before revoking the companion still sees everything');
select tests.login_as((select pat from u));
select public.end_companion_link((select id from link_ids where uid = (select c_full from u)));
select tests.login_as((select c_full from u));
select is(tests.visible(), (select nothing from want), 'revoked companion immediately sees zero rows in every table (patients included)');
select is((select status::text from public.companion_links), 'revoked', 'she can still read her own link row to see that access ended');
select is((select count(*)::int from public.appointments where patient_id = (select p1 from pt)), 0, 'no appointments after revoke');

-- ---- leave: the companion ends the link
select tests.login_as((select c_full2 from u));
select is(tests.visible(), (select everything from want), 'second companion sees everything before leaving');
select public.end_companion_link((select id from link_ids where uid = (select c_full2 from u)));
select is(tests.visible(), (select nothing from want), 'a companion who left sees zero rows everywhere');

-- ---- the invite + approval flow end to end through the RPCs
select tests.login_as((select pat from u));
create temp table e2e as select public.create_companion_invite() as code;
grant select on e2e to authenticated;
select tests.login_as((select c_stranger from u));
create temp table e2e_link as select public.redeem_companion_code((select code from e2e), 'friend') as id;
grant select on e2e_link to authenticated;
select is(tests.visible(), (select nothing from want), 'redeemed but not yet approved: still zero rows');
select tests.login_as((select pat from u));
select public.decide_companion_link((select id from e2e_link), true, '{"appointments":true}');
select tests.login_as((select c_stranger from u));
select is(tests.visible(), '1,0,1,0,1,0,0,0,0,0,0,0,0', 'approved with appointments only: the patient, the care team and the appointment');
select tests.login_as((select pat from u));
select public.end_companion_link((select id from e2e_link));
select tests.login_as((select c_stranger from u));
select is(tests.visible(), (select nothing from want), 'revoked again: zero rows');

-- ---- doctors: only the care team sees links; others see nothing
select tests.login_as((select doc from u));
select ok((select count(*) from public.companion_links) >= 6, 'care-team doctor sees the companion links of her patient');
select tests.login_as((select doc_b from u));
select is((select count(*)::int from public.companion_links), 0, 'a doctor not on the care team sees zero companion links');
select is((select count(*)::int from public.companion_invites), 0, 'a doctor not on the care team sees zero invites');
select is(tests.visible(), (select nothing from want), 'a doctor not on the care team sees zero clinical rows');

-- ---- another patient never sees these links
select tests.login_as((select pat2 from u));
select is((select count(*)::int from public.companion_links), 0, 'another patient sees none of these links');

select * from finish();
rollback;
