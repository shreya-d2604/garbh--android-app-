-- create_companion_invite: who may call it, hashed storage, expiry, one active invite, privileges.
begin;
\ir helpers/setup.psql
select plan(24);

create temp table u as select
  tests.create_user('doc@x.test',  'doctor')    as doc,
  tests.create_user('p1@x.test',   'patient')   as pat,
  tests.create_user('p2@x.test',   'patient')   as pat2,
  tests.create_user('pu@x.test',   'patient')   as unverified,
  tests.create_user('c@x.test',    'companion') as comp,
  tests.create_user('desk@x.test', 'receptionist') as desk;
create temp table preg as select
  tests.create_pregnancy((select pat from u), (select doc from u), 20)  as p1,
  tests.create_pregnancy((select pat2 from u), (select doc from u), 12) as p2;
create temp table pt as select
  (select patient_id from public.pregnancies where id = (select p1 from preg)) as p1;
grant select on pt to authenticated;
-- An unverified patient: app-registered, no MRN.
insert into public.patients (user_id, full_name, registration_source) values ((select unverified from u), 'Unverified', 'app');
create temp table codes (label text, code text);
grant select on u, preg to authenticated;
grant all on codes to authenticated;

-- ---- denied
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.create_companion_invite() $$, 'P0001', 'NOT_AUTHENTICATED', 'signed-out caller is rejected');

select tests.login_as((select unverified from u));
select throws_ok($$ select public.create_companion_invite() $$, 'P0001', 'NOT_VERIFIED', 'unverified patient cannot invite');

select tests.login_as((select comp from u));
select throws_ok($$ select public.create_companion_invite() $$, 'P0001', 'NOT_ALLOWED', 'companion cannot create invites');
select tests.login_as((select doc from u));
select throws_ok($$ select public.create_companion_invite() $$, 'P0001', 'NOT_ALLOWED', 'doctor cannot create invites');
select tests.login_as((select desk from u));
select throws_ok($$ select public.create_companion_invite() $$, 'P0001', 'NOT_ALLOWED', 'receptionist cannot create invites');

-- ---- allowed: verified patient
select tests.login_as((select pat from u));
insert into codes select 'first', public.create_companion_invite();
select matches((select code from codes where label = 'first'),
  '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{3}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{3}$',
  'code is XXX-XXX from the unambiguous alphabet (no 0 O 1 I L)');
select is((select count(*)::int from public.companion_invites), 1, 'patient sees her one invite');
select is((select expires_at from public.companion_invites), now() + interval '24 hours', 'invite expires in 24 hours');
select is((select max_uses::int from public.companion_invites), 1, 'single use');

-- the plaintext is never stored; only sha256(code || pepper)
select is((select count(*)::int from public.companion_invites
           where code_hash = replace((select code from codes where label = 'first'), '-', '')
              or code_hash = (select code from codes where label = 'first')), 0, 'plaintext code is not stored');
select is((select length(code_hash) from public.companion_invites), 64, 'stored value is a sha256 hex digest');
select tests.logout();
select is((select code_hash from public.companion_invites where patient_id = (select p1 from pt) and revoked_at is null),
          private.companion_code_hash(replace((select code from codes where label = 'first'), '-', '')),
          'stored hash = sha256(code || pepper)');
select isnt((select code_hash from public.companion_invites where patient_id = (select p1 from pt)),
            encode(extensions.digest(replace((select code from codes where label = 'first'), '-', ''), 'sha256'), 'hex'),
            'hash depends on the server pepper (unsalted sha256 does not match)');

-- ---- one active invite per patient: a new one revokes the old one
select tests.login_as((select pat from u));
insert into codes select 'second', public.create_companion_invite();
select isnt((select code from codes where label = 'second'), (select code from codes where label = 'first'), 'a new code is generated');
select is((select count(*)::int from public.companion_invites where revoked_at is null and used_at is null), 1,
          'exactly one active invite after regenerating');
select is((select count(*)::int from public.companion_invites where revoked_at is not null), 1, 'the previous invite was revoked');

-- ---- visibility and direct writes
select tests.login_as((select pat2 from u));
select is((select count(*)::int from public.companion_invites), 0, 'another patient cannot see these invites');
insert into codes select 'other-patient', public.create_companion_invite();
select is((select count(*)::int from public.companion_invites), 1, 'every patient has her own invite');
select throws_ok(
  $$ insert into public.companion_invites (patient_id, code_hash) values ((select id from public.patients limit 1), 'x') $$,
  '42501', null, 'patients cannot insert invites directly');

select tests.login_as((select comp from u));
select is((select count(*)::int from public.companion_invites), 0, 'companions cannot read invites');
select throws_ok($$ select * from private.app_secrets $$, '42501', null, 'the pepper is not readable by API roles');

-- ---- code generator and privileges
select tests.logout();
select is((select count(*)::int from generate_series(1, 300) g
           where private.companion_new_code() !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$'), 0,
          '300 generated codes are all 6 symbols from the alphabet');
select is((select count(distinct private.companion_new_code())::int from generate_series(1, 200)) > 190, true,
          'generated codes are random');
select is(has_function_privilege('anon', 'public.create_companion_invite()', 'execute'), false, 'anon cannot execute');

select * from finish();
rollback;
