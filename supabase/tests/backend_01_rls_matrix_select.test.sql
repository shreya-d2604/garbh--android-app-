-- RLS READ MATRIX (PLAN.md §4, §13): every role x every public table/view x SELECT, plus the
-- permission toggles, revocation and "off the care team sees zero rows" cases.
-- The world (helpers/backend.psql) has two patients; counts are scoped to its rows because the
-- seed data is present in the test database too.
--
-- Columns: admin, doc_a (primary P1), doc_c (backup P1), doc_b (primary P2), doc_x (REMOVED
-- backup of P1), desk (receptionist), pat1, pat2, c_full, c_none, c_appt, c_jour, c_summ, c_rep,
-- c_rx (one permission each), c_rev (revoked), c_pend (pending), c_p2 (follows P2), nobody
-- (signed in, no role yet).
begin;
\ir helpers/setup.psql
\ir helpers/backend.psql
select no_plan();
select tests.build_world();

create temp table roles (pos int primary key, key text);
insert into roles values
  (1,'admin'),(2,'doc_a'),(3,'doc_c'),(4,'doc_b'),(5,'doc_x'),(6,'desk'),(7,'pat1'),(8,'pat2'),
  (9,'c_full'),(10,'c_none'),(11,'c_appt'),(12,'c_jour'),(13,'c_summ'),(14,'c_rep'),(15,'c_rx'),
  (16,'c_rev'),(17,'c_pend'),(18,'c_p2'),(19,'nobody');

-- tbl, scope (which rows belong to the world), expected visible rows per role (order above).
create temp table matrix (tbl text primary key, scope text not null, expect int[] not null);
insert into matrix values
 ('patients',        'id in ((select patient1 from w),(select patient2 from w))',
                     array[2,1,1,1,0,2, 1,1, 1,1,1,1,1,1,1, 0,0, 1, 0]),
 ('pregnancies',     'id in ((select p1 from w),(select p2 from w))',
                     array[2,1,1,1,0,2, 1,1, 1,0,0,1,0,0,0, 0,0, 1, 0]),
 ('care_team',       'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[4,3,3,1,0,4, 3,1, 3,0,3,0,0,0,0, 0,0, 1, 0]),
 ('visits',          'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[3,2,2,1,0,3, 2,1, 2,0,0,2,0,0,0, 0,0, 1, 0]),
 ('appointments',    'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[3,2,2,1,0,3, 2,1, 2,0,2,0,0,0,0, 0,0, 1, 0]),
 ('consultations',   'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[3,2,2,1,0,0, 1,1, 1,0,0,0,1,0,0, 0,0, 1, 0]),
 ('consultation_private_notes', 'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[3,2,2,1,0,0, 0,0, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 -- c_rx: 0 today (see the TODO test below): the policy's subselect on consultations runs under
 -- the companion's own RLS, so `prescriptions` WITHOUT `summaries` sees nothing. Intended: 1.
 ('prescription_items', 'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[3,2,2,1,0,0, 1,1, 1,0,0,0,0,0,0, 0,0, 1, 0]),
 ('reports',         'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[3,2,2,1,0,0, 1,1, 1,0,0,0,0,1,0, 0,0, 1, 0]),
 ('report_files',    'report_id in ((select r1 from w),(select r1del from w),(select r2 from w))',
                     array[3,2,2,1,0,0, 1,1, 1,0,0,0,0,1,0, 0,0, 1, 0]),
 ('lab_results',     'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[3,2,2,1,0,0, 1,1, 1,0,0,0,0,1,0, 0,0, 1, 0]),
 ('ai_summaries',    'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[3,2,2,1,0,0, 0,0, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 ('published_summaries', 'pregnancy_id in ((select p1 from w),(select p2 from w))',
                     array[2,1,1,1,0,0, 1,1, 1,0,0,0,1,0,0, 0,0, 1, 0]),
 ('companion_links', 'patient_id in ((select patient1 from w),(select patient2 from w))',
                     array[10,9,9,1,0,0, 9,1, 1,1,1,1,1,1,1, 1,1, 1, 0]),
 ('companion_invites', 'patient_id in ((select patient1 from w),(select patient2 from w))',
                     array[2,0,0,0,0,0, 1,1, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 ('code_redeem_attempts', 'user_id = (select c_full from w)',
                     array[1,0,0,0,0,0, 0,0, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 ('notifications',  $$type = 'matrix_test'$$,
                     array[4,1,0,0,0,0, 1,1, 1,0,0,0,0,0,0, 0,0, 0, 0]),
 ('push_tokens',    $$expo_push_token like 'ExponentPushToken[w-%'$$,
                     array[2,0,0,0,0,0, 1,1, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 ('data_requests',  'user_id in ((select pat1 from w),(select pat2 from w))',
                     array[2,0,0,0,0,0, 1,1, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 ('audit_log',      $$table_name = 'matrix_test'$$,
                     array[1,0,0,0,0,0, 0,0, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 ('profiles',       $$email like '%@w.test'$$,
                     array[19,19,19,19,19,19, 9,2, 1,1,1,1,1,1,1, 1,1, 1, 1]),
 ('staff_details',  $$profile_id in (select id from public.profiles where email like '%@w.test')$$,
                     array[6,6,6,6,6,6, 0,0, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 ('hospital_settings', 'true',
                     array[1,1,1,1,1,1, 1,1, 1,1,1,1,1,1,1, 1,1, 1, 1]),
 ('doctor_availability', 'doctor_id in ((select doc_a from w),(select doc_b from w))',
                     array[3,3,3,3,3,3, 0,0, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 ('doctor_time_off', 'doctor_id = (select doc_a from w)',
                     array[1,1,1,1,1,1, 0,0, 0,0,0,0,0,0,0, 0,0, 0, 0]),
 ('doctor_directory', 'id in ((select doc_a from w),(select doc_b from w),(select doc_c from w),(select doc_x from w))',
                     array[4,4,4,4,4,4, 4,4, 4,4,4,4,4,4,4, 4,4, 4, 0]);

-- Matrix coverage: a new public table must be added here (and its policies reviewed).
select is(
  array(select tablename::text from pg_tables where schemaname = 'public'
        except select tbl from matrix
        except select unnest(array['visit_templates','week_content','milestones','lab_tests','drug_catalog','curated_guidance'])
        order by 1),
  array[]::text[],
  'every public table is covered by the read matrix');

-- The main grid.
select is(
  tests.visible((to_jsonb(w) ->> r.key)::uuid, format('select 1 from public.%I where %s', m.tbl, m.scope)),
  m.expect[r.pos]::bigint,
  format('%s sees %s row(s) of %s', r.key, m.expect[r.pos], m.tbl))
from (select * from matrix order by tbl) m cross join (select * from roles order by pos) r cross join w;

-- Catalog tables: every onboarded user reads them all; a user without a role reads nothing.
create temp table catalogs (tbl text primary key);
insert into catalogs values ('visit_templates'),('week_content'),('milestones'),('lab_tests'),('drug_catalog'),('curated_guidance');
select is(
  tests.visible((to_jsonb(w) ->> r.key)::uuid, format('select 1 from public.%I', c.tbl)),
  case when r.key = 'nobody' then 0 else (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.tbl), false, true, '')))[1]::text::bigint end,
  format('%s reads %s catalog rows of %s', r.key, case when r.key = 'nobody' then 'no' else 'all' end, c.tbl))
from (select * from catalogs order by tbl) c cross join (select * from roles order by pos) r cross join w;

----------------------------------------------------------------------------
-- Scenarios in words
----------------------------------------------------------------------------
-- A doctor who was never on / was removed from the care team: ZERO rows on every clinical table.
select is(tests.visible((select doc_x from w), 'select 1 from public.' || t),  0::bigint, 'removed backup doctor: zero rows in ' || t)
from unnest(array['patients','pregnancies','visits','consultations','consultation_private_notes','prescription_items','reports','report_files','lab_results','ai_summaries','published_summaries','companion_links','care_team']) t
where t not in ('patients','pregnancies','care_team','visits') or true;

-- Patient never sees drafts, private notes or the AI table; companions neither.
select is(tests.visible((select pat1 from w), 'select 1 from public.ai_summaries'), 0::bigint, 'patient cannot read ai_summaries at all');
select is(tests.visible((select pat1 from w), 'select 1 from public.published_summaries where final is null'), 0::bigint, 'patient only sees published summaries with a final');
select is(tests.visible((select pat1 from w), $$select 1 from public.consultations where published_at is null$$), 0::bigint, 'patient never sees an unpublished consultation');
select is(tests.visible((select pat1 from w), $$select 1 from public.lab_results where not verified$$), 0::bigint, 'patient never sees unverified lab values');
select is(tests.visible((select pat1 from w), 'select 1 from public.consultation_private_notes'), 0::bigint, 'patient never sees private notes');
select is(tests.visible((select pat1 from w), $$select 1 from public.reports where deleted_at is not null$$), 0::bigint, 'patient never sees a deleted report');

-- doctor_attention_flags are doctor-only: no viewer of published_summaries ever sees them.
select is(tests.visible((to_jsonb(w) ->> r.key)::uuid, $$select 1 from public.published_summaries where final::text like '%doctor_attention_flags%'$$), 0::bigint,
          r.key || ' never sees doctor_attention_flags in published_summaries')
from (select * from roles where pos <= 18 order by pos) r cross join w;

-- Receptionist: demographics, schedule and care team, never clinical data.
select is(
  (select sum(tests.visible((select desk from w), format('select 1 from public.%I', t)))::int
   from unnest(array['consultations','consultation_private_notes','prescription_items','reports','report_files','lab_results','ai_summaries','published_summaries','companion_links','companion_invites','notifications','push_tokens']) t),
  0, 'receptionist sees no clinical, companion or personal data');

-- Permission toggles take effect immediately, one at a time.
update public.companion_links set can_view_reports = true where companion_user_id = (select c_none from w);
select is(tests.visible((select c_none from w), 'select 1 from public.reports'), 1::bigint, 'companion: turning on reports shows the live report');
select is(tests.visible((select c_none from w), 'select 1 from public.consultations'), 0::bigint, 'companion: reports permission does not open consultations');
update public.companion_links set can_view_reports = false where companion_user_id = (select c_none from w);
select is(tests.visible((select c_none from w), 'select 1 from public.reports'), 0::bigint, 'companion: turning reports off hides them again');
update public.companion_links set can_view_summaries = true where companion_user_id = (select c_none from w);
select is(tests.visible((select c_none from w), 'select 1 from public.published_summaries'), 1::bigint, 'companion: summaries on shows the published summary only');
select is(tests.visible((select c_none from w), 'select 1 from public.ai_summaries'), 0::bigint, 'companion: still no access to the AI table');

-- Revocation / leaving cuts access at once.
update public.companion_links set status = 'revoked' where companion_user_id = (select c_full from w);
select is(tests.visible((select c_full from w), 'select 1 from public.patients'), 0::bigint, 'revoked companion: patient no longer visible');
select is(tests.visible((select c_full from w), 'select 1 from public.reports'), 0::bigint, 'revoked companion: reports gone');
update public.companion_links set status = 'left' where companion_user_id = (select c_appt from w);
select is(tests.visible((select c_appt from w), 'select 1 from public.appointments'), 0::bigint, 'companion who left: appointments gone');

-- Care-team changes are immediate too.
select is(tests.visible((select doc_c from w), 'select 1 from public.consultations'), 2::bigint, 'backup doctor sees the consultations');
update public.care_team set removed_at = now() where doctor_id = (select doc_c from w);
select is(tests.visible((select doc_c from w), 'select 1 from public.consultations'), 0::bigint, 'removed backup: access gone at once');
select is(tests.visible((select doc_c from w), 'select 1 from public.ai_summaries'), 0::bigint, 'removed backup: AI drafts gone at once');
insert into public.care_team (pregnancy_id, doctor_id, care_role) values ((select p1 from w), (select doc_b from w), 'backup');
select is(tests.visible((select doc_b from w), 'select 1 from public.consultations where pregnancy_id = (select p1 from w)'), 2::bigint, 'doctor added as backup sees P1 at once');

-- Deactivated users lose everything (auth_role() is null).
update public.profiles set is_active = false where id = (select pat1 from w);
select is(tests.visible((select pat1 from w), 'select 1 from public.consultations'), 0::bigint, 'deactivated patient sees no clinical data');
select is(tests.visible((select pat1 from w), 'select 1 from public.appointments'), 0::bigint, 'deactivated patient sees no appointments');
update public.profiles set is_active = false where id = (select doc_a from w);
select is(tests.visible((select doc_a from w), 'select 1 from public.consultations'), 0::bigint, 'deactivated doctor sees nothing');

-- KNOWN GAPS in the foundation policies (reported to the head; these flip to passing once fixed).
select todo_start('prescription_items_published_select: its consultations subselect is subject to RLS');
select is(tests.visible((select c_rx from w), 'select 1 from public.prescription_items'), 1::bigint,
          'companion with only `prescriptions` sees the prescription items');
select todo_end();
select todo_start('patients_self_select / profiles_self_select do not check is_active');
select is(tests.visible((select pat1 from w), 'select 1 from public.patients'), 0::bigint,
          'deactivated patient cannot read her patients row');
select todo_end();

select * from finish();
rollback;
