-- companion_pregnancy_ids: only for patients the caller follows (approved link), nothing otherwise.
begin;
\ir helpers/setup.psql
select plan(8);

create temp table u as select
  tests.create_user('doc@x.test',  'doctor')    as doc,
  tests.create_user('p1@x.test',   'patient')   as pat,
  tests.create_user('p2@x.test',   'patient')   as pat2,
  tests.create_user('c@x.test',    'companion') as comp,
  tests.create_user('c2@x.test',   'companion') as comp2;
create temp table preg as select
  tests.create_pregnancy((select pat from u),  (select doc from u), 20) as p1,
  tests.create_pregnancy((select pat2 from u), (select doc from u), 12) as p2;
create temp table pt as select
  (select patient_id from public.pregnancies where id = (select p1 from preg)) as p1,
  (select patient_id from public.pregnancies where id = (select p2 from preg)) as p2;
-- comp follows patient 1 with NO permissions; comp2 only has a pending request.
insert into public.companion_links (patient_id, companion_user_id, relation, status) values
  ((select p1 from pt), (select comp from u),  'friend', 'approved'),
  ((select p1 from pt), (select comp2 from u), 'friend', 'pending');
create temp table lk as select id from public.companion_links where companion_user_id = (select comp from u);
grant select on u, preg, pt, lk to authenticated;

select tests.login_as((select comp from u));
select is((select array_agg(x) from public.companion_pregnancy_ids((select p1 from pt)) x), array[(select p1 from preg)],
          'an approved companion gets the pregnancy ids even without the journey permission');
select is((select count(*)::int from public.pregnancies), 0, '... while the pregnancies table itself stays hidden');
select is((select count(*)::int from public.companion_pregnancy_ids((select p2 from pt))), 0, 'ids of a patient she does not follow: none');

select tests.login_as((select comp2 from u));
select is((select count(*)::int from public.companion_pregnancy_ids((select p1 from pt))), 0, 'a pending request: none');

select tests.login_as((select pat from u));
select is((select count(*)::int from public.companion_pregnancy_ids((select p1 from pt))), 0, 'a patient is not a companion: none');
select tests.login_as((select doc from u));
select is((select count(*)::int from public.companion_pregnancy_ids((select p1 from pt))), 0, 'a doctor is not a companion: none');

select tests.login_as((select pat from u));
select public.end_companion_link((select id from lk));
select tests.login_as((select comp from u));
select is((select count(*)::int from public.companion_pregnancy_ids((select p1 from pt))), 0, 'after revoke: none');
select tests.logout();
select is(has_function_privilege('anon', 'public.companion_pregnancy_ids(uuid)', 'execute'), false, 'anon cannot execute');

select * from finish();
rollback;
