-- Storage policies for the private `reports` bucket. Path: {patient_id}/{pregnancy_id}/{report_id}/{file}.
begin;
\ir helpers/setup.psql
\ir helpers/backend.psql
select no_plan();
select tests.build_world();

-- Objects: the live report's file (attached to a report), the soft-deleted report's file, an
-- upload not yet attached to any report, a mis-filed one (wrong patient folder), P2's file.
create temp table o as select
  (select patient1 from w) || '/' || (select p1 from w) || '/' || (select r1 from w) || '/a.pdf'       as live,
  (select patient1 from w) || '/' || (select p1 from w) || '/' || (select r1del from w) || '/a.pdf'    as deleted,
  (select patient1 from w) || '/' || (select p1 from w) || '/' || gen_random_uuid() || '/orphan.pdf'   as orphan,
  (select patient2 from w) || '/' || (select p1 from w) || '/' || gen_random_uuid() || '/misfiled.pdf' as misfiled,
  (select patient2 from w) || '/' || (select p2 from w) || '/' || (select r2 from w) || '/a.pdf'       as p2file;
grant select on o to authenticated;
insert into storage.objects (bucket_id, name)
  select 'reports', unnest(array[live, deleted, orphan, misfiled, p2file]) from o;
insert into storage.buckets (id, name) values ('other', 'other');
insert into storage.objects (bucket_id, name) values ('other', 'x/y/z/a.pdf');   -- not ours

create temp table roles (pos int primary key, key text, expect int);
-- visible objects of the 5 above, in bucket `reports`
insert into roles values
  (1,'admin',5), (2,'doc_a',3), (3,'doc_c',3), (4,'doc_b',1), (5,'doc_x',0), (6,'desk',0),
  (7,'pat1',1), (8,'pat2',1), (9,'c_full',1), (10,'c_none',0), (11,'c_appt',0), (12,'c_rep',1),
  (13,'c_rev',0), (14,'c_pend',0), (15,'c_p2',1), (16,'nobody',0);

select is(
  tests.visible((to_jsonb(w) ->> r.key)::uuid,
    $$select 1 from storage.objects where bucket_id = 'reports' and name in (select unnest(array[live, deleted, orphan, misfiled, p2file]) from o)$$),
  r.expect::bigint, format('%s sees %s of the 5 report objects', r.key, r.expect))
from (select * from roles order by pos) r cross join w;

-- Which one, for the interesting roles
select is(tests.visible((select pat1 from w), format('select 1 from storage.objects where bucket_id = ''reports'' and name = %L', (select live from o))), 1::bigint, 'patient reads the file of her visible report');
select is(tests.visible((select pat1 from w), format('select 1 from storage.objects where bucket_id = ''reports'' and name = %L', (select deleted from o))), 0::bigint, 'patient does not read the file of a deleted report');
select is(tests.visible((select pat1 from w), format('select 1 from storage.objects where bucket_id = ''reports'' and name = %L', (select orphan from o))), 0::bigint, 'patient does not read a file not attached to a report');
select is(tests.visible((select doc_a from w), format('select 1 from storage.objects where bucket_id = ''reports'' and name = %L', (select orphan from o))), 1::bigint, 'care-team doctor reads a fresh upload before the report row exists');
select is(tests.visible((select doc_a from w), format('select 1 from storage.objects where bucket_id = ''reports'' and name = %L', (select misfiled from o))), 0::bigint, 'a mis-filed object (wrong patient folder) is nobody''s');
select is(tests.visible((select doc_a from w), format('select 1 from storage.objects where bucket_id = ''reports'' and name = %L', (select p2file from o))), 0::bigint, 'doctor off the care team cannot read another patient''s file');
select is(tests.visible((select doc_a from w), $$select 1 from storage.objects where bucket_id = 'other'$$), 0::bigint, 'the policies do not open other buckets');

-- Writes
create function tests.upload(p_name text, p_bucket text default 'reports') returns text language sql as
  $$ select format('insert into storage.objects (bucket_id, name) values (%L, %L)', p_bucket, p_name) $$;
select is(tests.write_as((select doc_a from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient1 from w), (select p1 from w), gen_random_uuid()))), 1, 'primary doctor uploads');
select is(tests.write_as((select doc_c from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient1 from w), (select p1 from w), gen_random_uuid()))), 1, 'backup doctor uploads');
select is(tests.write_as((select admin from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient1 from w), (select p1 from w), gen_random_uuid()))), 1, 'admin uploads');
select is(tests.write_as((select doc_b from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient1 from w), (select p1 from w), gen_random_uuid()))), -1, 'doctor off the care team cannot upload');
select is(tests.write_as((select doc_x from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient1 from w), (select p1 from w), gen_random_uuid()))), -1, 'removed backup cannot upload');
select is(tests.write_as((select desk from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient1 from w), (select p1 from w), gen_random_uuid()))), -1, 'receptionist cannot upload');
select is(tests.write_as((select pat1 from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient1 from w), (select p1 from w), gen_random_uuid()))), -1, 'patient cannot upload');
select is(tests.write_as((select c_full from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient1 from w), (select p1 from w), gen_random_uuid()))), -1, 'companion cannot upload');
select is(tests.write_as((select doc_a from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient2 from w), (select p1 from w), gen_random_uuid()))), -1, 'a doctor cannot file under another patient''s folder');
select is(tests.write_as((select doc_a from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient2 from w), (select p2 from w), gen_random_uuid()))), -1, 'a doctor cannot upload to a pregnancy he is not on');
select is(tests.write_as((select doc_a from w), tests.upload('not-a-valid-path.pdf')), -1, 'malformed paths are refused');
select is(tests.write_as((select doc_a from w), tests.upload('a/b/c', 'reports')), -1, 'short paths are refused');
select is(tests.write_as((select doc_a from w), tests.upload(format('%s/%s/%s/new.pdf', (select patient1 from w), (select p1 from w), gen_random_uuid()), 'avatars')), -1, 'the policies do not grant writes in other buckets');
select is(tests.write_as((select doc_a from w), format('update storage.objects set name = name where name = %L', (select live from o))), 1, 'doctor overwrites a file of his patient');
-- Direct DELETE is blocked for everybody by Supabase's storage.protect_delete trigger (files are
-- removed through the Storage API, which then applies this policy), so check the policy instead.
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'reports_bucket_doctor_delete'), 1, 'a delete policy exists for care-team doctors');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'reports_bucket_%' and cmd in ('DELETE', 'ALL') and policyname <> 'reports_bucket_doctor_delete' and policyname <> 'reports_bucket_admin_all'), 0, 'and for nobody else');
select is(tests.write_as((select pat1 from w), format('update storage.objects set name = name where name = %L', (select live from o))), 0, 'nor overwrite it');

-- Path parser
select is(public.report_object_pregnancy((select live from o)), (select p1 from w), 'parses the pregnancy id of a valid path');
select is(public.report_object_pregnancy((select misfiled from o)), null::uuid, 'wrong patient folder -> null');
select is(public.report_object_pregnancy('x/y/z/a.pdf'), null::uuid, 'garbage -> null');
select is(public.report_object_pregnancy((select patient1 from w) || '/' || (select p1 from w) || '/' || gen_random_uuid()), null::uuid, 'missing file segment -> null');
select is(public.report_object_pregnancy((select patient1 from w) || '/' || (select p1 from w) || '/' || gen_random_uuid() || '/a/b.pdf'), null::uuid, 'extra path segments -> null');
select is(public.report_object_pregnancy(upper((select live from o))), null::uuid, 'only lower-case uuids');
select is(public.report_object_pregnancy(null), null::uuid, 'null -> null');
select is(has_function_privilege('anon', 'public.report_object_pregnancy(text)', 'execute'), false, 'anon cannot call the path helper');

select * from finish();
rollback;
