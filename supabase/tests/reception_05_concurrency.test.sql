-- Concurrency: two real database sessions race for the same slot; exactly one wins.
--
-- A single pgTAP transaction cannot race itself, so this file uses dblink: fixtures are committed
-- by a helper connection, the sessions race, and the fixtures are deleted again at the end.
-- Nothing this file does is visible to the other test files (and `npm run db:check` resets the
-- database anyway).
--   A. Patient path: two patients, same slot, one session holds the transaction open (advisory lock)
--      -> exactly one booking, the other gets SLOT_TAKEN.
--   B. Staff path: 20 rounds of two receptionists booking the same slot at the same moment
--      -> exactly one winner every round, never a double booking.
--   C. The exclusion constraint no_doctor_overlap is the final guard: two direct inserts that
--      bypass the RPC and the lock still cannot both succeed (SQLSTATE 23P01).
begin;
\ir helpers/setup.psql
select plan(10);

create extension if not exists dblink with schema extensions;

create function pg_temp.conn() returns text language sql as $$
  select format('host=%s port=5432 dbname=postgres user=postgres password=postgres', inet_server_addr())
$$;
-- Starts a query on a connection; fails loudly if the connection was not ready.
create function pg_temp.send(p_conn text, p_sql text) returns void language plpgsql as $$
begin
  if extensions.dblink_send_query(p_conn, p_sql) <> 1 then
    raise exception 'could not send the query on connection %', p_conn;
  end if;
end $$;
-- Waits for the pending query of a connection; returns 'ok' or '<sqlstate>:<message>'.
-- The connection is always drained so it can be reused for the next round.
create function pg_temp.collect(p_conn text) returns text language plpgsql as $$
declare r text; v text;
begin
  begin
    select x into r from extensions.dblink_get_result(p_conn, true) as t(x text);
    v := 'ok';
  exception when others then
    v := sqlstate || ':' || sqlerrm;
  end;
  begin
    perform x from extensions.dblink_get_result(p_conn, false) as t(x text);
  exception when others then
    null;
  end;
  return v;
end $$;
-- Sessions that act as a given user (RLS and auth.uid() apply).
create function pg_temp.open_as(p_name text, p_uid uuid) returns void language plpgsql as $$
begin
  perform extensions.dblink_connect(p_name, pg_temp.conn());
  perform extensions.dblink_exec(p_name, 'set role authenticated');
  perform extensions.dblink_exec(p_name, format('set request.jwt.claims = %L', json_build_object('sub', p_uid, 'role', 'authenticated')::text));
end $$;

create temp table ids as select
  'cccccccc-0000-4000-8000-000000000001'::uuid as doc,
  'cccccccc-0000-4000-8000-000000000011'::uuid as p1,   'cccccccc-0000-4000-8000-000000000012'::uuid as p2,
  'cccccccc-0000-4000-8000-000000000021'::uuid as desk1, 'cccccccc-0000-4000-8000-000000000022'::uuid as desk2,
  'cccccccc-0000-4000-8000-0000000000a1'::uuid as pt1,  'cccccccc-0000-4000-8000-0000000000a2'::uuid as pt2,
  'cccccccc-0000-4000-8000-0000000000b1'::uuid as pr1,  'cccccccc-0000-4000-8000-0000000000b2'::uuid as pr2,
  to_timestamp(ceil(extract(epoch from now() + interval '10 hours') / 900) * 900) as base;

-- ---------------------------------------------------------------- committed fixtures
select extensions.dblink_connect('cc_setup', pg_temp.conn());
select extensions.dblink_exec('cc_setup', format($fx$
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    ('00000000-0000-0000-0000-000000000000', %1$L, 'authenticated', 'authenticated', 'cc-doc@x.test',   '{"role":"doctor"}',       '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', %2$L, 'authenticated', 'authenticated', 'cc-p1@x.test',    '{"role":"patient"}',      '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', %3$L, 'authenticated', 'authenticated', 'cc-p2@x.test',    '{"role":"patient"}',      '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', %4$L, 'authenticated', 'authenticated', 'cc-desk1@x.test', '{"role":"receptionist"}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', %5$L, 'authenticated', 'authenticated', 'cc-desk2@x.test', '{"role":"receptionist"}', '{}', now(), now());
  insert into public.staff_details (profile_id, accepts_new_patients) values (%1$L, true);
  insert into public.doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes)
    select %1$L, d, time '00:00', time '24:00', 15 from generate_series(0, 6) d;
  insert into public.patients (id, user_id, full_name, registration_source, verified_at, mrn) values
    (%6$L, %2$L, 'Race One', 'desk', now(), 'CC-1'), (%7$L, %3$L, 'Race Two', 'desk', now(), 'CC-2');
  insert into public.pregnancies (id, patient_id, lmp_date, lmp_source) values
    (%8$L, %6$L, public.hospital_today() - 140, 'clinician'), (%9$L, %7$L, public.hospital_today() - 140, 'clinician');
  insert into public.care_team (pregnancy_id, doctor_id, care_role) values (%8$L, %1$L, 'primary'), (%9$L, %1$L, 'primary');
$fx$, (select doc from ids), (select p1 from ids), (select p2 from ids), (select desk1 from ids), (select desk2 from ids),
      (select pt1 from ids), (select pt2 from ids), (select pr1 from ids), (select pr2 from ids)));

-- ---------------------------------------------------------------- A: patients race for one slot
select pg_temp.open_as('cc_a1', (select p1 from ids));
select pg_temp.open_as('cc_a2', (select p2 from ids));
-- session 1 books and then keeps its transaction (and the doctor lock) open for 1.5 s
select pg_temp.send('cc_a1', format('do $b$ begin perform public.book_appointment(%L, %L); perform pg_sleep(1.5); end $b$',
  (select doc from ids), (select base from ids)));
select pg_sleep(0.4);
select pg_temp.send('cc_a2', format('select public.book_appointment(%L, %L)::text', (select doc from ids), (select base from ids)));
create temp table a_res as select pg_temp.collect('cc_a1') as r1, pg_temp.collect('cc_a2') as r2;

select is((select (r1 = 'ok')::int + (r2 = 'ok')::int from a_res), 1, 'A: exactly one of the two patients booked the slot');
select ok((select r1 like '%SLOT_TAKEN' or r2 like '%SLOT_TAKEN' from a_res), 'A: the other one got SLOT_TAKEN (not a raw constraint error)');
select is((select n::int from extensions.dblink('cc_setup', format('select count(*) from public.appointments where doctor_id = %L and starts_at = %L and status = ''booked''',
  (select doc from ids), (select base from ids))) as t(n bigint)), 1, 'A: exactly one appointment row exists for the slot');
select extensions.dblink_disconnect('cc_a1');
select extensions.dblink_disconnect('cc_a2');

-- ---------------------------------------------------------------- B: 20 rounds of staff racing
select pg_temp.open_as('cc_b1', (select desk1 from ids));
select pg_temp.open_as('cc_b2', (select desk2 from ids));
create temp table b_res (round int, r1 text, r2 text);
do $race$
declare i int; v_doc uuid := (select doc from ids); v_base timestamptz := (select base from ids);
begin
  for i in 1..20 loop
    perform pg_temp.send('cc_b1', format('select public.book_appointment(%L, %L, null, %L)::text', v_doc, v_base + i * interval '15 minutes', (select pr1 from ids)));
    perform pg_temp.send('cc_b2', format('select public.book_appointment(%L, %L, null, %L)::text', v_doc, v_base + i * interval '15 minutes', (select pr2 from ids)));
    insert into b_res values (i, pg_temp.collect('cc_b1'), pg_temp.collect('cc_b2'));
  end loop;
end $race$;
select is((select count(*)::int from b_res where (r1 = 'ok')::int + (r2 = 'ok')::int = 1), 20, 'B: exactly one winner in each of 20 simultaneous races');
select is((select count(*)::int from b_res where r1 not in ('ok') and r1 not like 'P0001:SLOT_TAKEN') + (select count(*)::int from b_res where r2 not in ('ok') and r2 not like 'P0001:SLOT_TAKEN'), 0,
  'B: every loser got a clean SLOT_TAKEN');
select is((select n::int from extensions.dblink('cc_setup', format('select count(*) from public.appointments where doctor_id = %L and starts_at > %L and starts_at <= %L',
  (select doc from ids), (select base from ids), (select base from ids) + interval '5 hours')) as t(n bigint)), 20, 'B: one appointment per slot, no duplicates');
select ok((select (r1 = 'ok') <> (r2 = 'ok') from b_res where round = 20), 'B: sanity, the last round has one winner');
select extensions.dblink_disconnect('cc_b1');
select extensions.dblink_disconnect('cc_b2');

-- ---------------------------------------------------------------- C: the constraint is the final guard
select extensions.dblink_connect('cc_c1', pg_temp.conn());
select extensions.dblink_connect('cc_c2', pg_temp.conn());
select pg_temp.send('cc_c1', format($q$do $b$ begin
    insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
    values (%1$L, %2$L, %3$L, %4$L, %4$L::timestamptz + interval '15 minutes', 'reception');
    perform pg_sleep(1.5); end $b$$q$, (select pt1 from ids), (select pr1 from ids), (select doc from ids), (select base from ids) + interval '24 hours'));
select pg_sleep(0.4);
select pg_temp.send('cc_c2', format($q$insert into public.appointments (patient_id, pregnancy_id, doctor_id, starts_at, ends_at, booking_channel)
    values (%1$L, %2$L, %3$L, %4$L::timestamptz + interval '5 minutes', %4$L::timestamptz + interval '20 minutes', 'reception') returning id::text$q$,
  (select pt2 from ids), (select pr2 from ids), (select doc from ids), (select base from ids) + interval '24 hours'));
create temp table c_res as select pg_temp.collect('cc_c1') as r1, pg_temp.collect('cc_c2') as r2;
select is((select (r1 = 'ok')::int + (r2 = 'ok')::int from c_res), 1, 'C: two overlapping direct inserts cannot both succeed');
select ok((select r1 like '23P01:%no_doctor_overlap%' or r2 like '23P01:%no_doctor_overlap%' from c_res), 'C: the loser is stopped by the exclusion constraint (23P01)');
select extensions.dblink_disconnect('cc_c1');
select extensions.dblink_disconnect('cc_c2');

-- ---------------------------------------------------------------- remove the committed fixtures
select extensions.dblink_exec('cc_setup', format($fx$
  delete from public.appointments where doctor_id = %1$L;
  delete from public.patients where id in (%2$L, %3$L);
  delete from public.audit_log where patient_id in (%2$L, %3$L) or actor_id in (%1$L, %4$L, %5$L, %6$L, %7$L)
     or (table_name in ('profiles', 'staff_details') and record_id in (%1$L, %4$L, %5$L, %6$L, %7$L));
  delete from auth.users where id in (%1$L, %4$L, %5$L, %6$L, %7$L);
$fx$, (select doc from ids), (select pt1 from ids), (select pt2 from ids), (select p1 from ids), (select p2 from ids), (select desk1 from ids), (select desk2 from ids)));
select is((select n::int from extensions.dblink('cc_setup', format('select count(*) from auth.users where email like %L', 'cc-%@x.test')) as t(n bigint)), 0, 'fixtures are removed again');
select extensions.dblink_disconnect('cc_setup');

select * from finish();
rollback;
