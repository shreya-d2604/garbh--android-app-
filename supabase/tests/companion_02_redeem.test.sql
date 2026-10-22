-- redeem_companion_code: normalising, single use, expiry, revoked invite, duplicate link,
-- wrong relation, role checks, and the 5-failures-per-hour lock-out.
begin;
\ir helpers/setup.psql
select plan(35);

create temp table u as select
  tests.create_user('doc@x.test',   'doctor')    as doc,
  tests.create_user('p1@x.test',    'patient')   as pat,
  tests.create_user('p2@x.test',    'patient')   as pat2,
  tests.create_user('c1@x.test',    'companion') as c1,
  tests.create_user('c2@x.test',    'companion') as c2,
  tests.create_user('c3@x.test',    'companion') as c3;
create temp table preg as select
  tests.create_pregnancy((select pat from u),  (select doc from u), 20) as p1,
  tests.create_pregnancy((select pat2 from u), (select doc from u), 12) as p2;
create temp table pt as select
  (select patient_id from public.pregnancies where id = (select p1 from preg)) as p1,
  (select patient_id from public.pregnancies where id = (select p2 from preg)) as p2;
create temp table codes (label text, code text);
create temp table res (label text, link uuid);
grant select on u, preg, pt to authenticated;
grant all on codes, res to authenticated;

-- a helper that reads the failures the way the DB sees them (code_redeem_attempts is admin-only)
create function tests.fails(p_user uuid) returns int language sql as $$
  select count(*)::int from public.code_redeem_attempts where user_id = p_user and not success $$;
grant execute on function tests.fails(uuid) to authenticated;

-- ---- patient 1 invites
select tests.login_as((select pat from u));
insert into codes select 'a', public.create_companion_invite();

-- ---- role checks and input checks
select tests.login_as((select pat from u));
select throws_ok($$ select public.redeem_companion_code('AAA-AAA', 'husband') $$, 'NOT_ALLOWED', null, 'a patient cannot redeem');
select tests.login_as((select doc from u));
select throws_ok($$ select public.redeem_companion_code('AAA-AAA', 'husband') $$, 'NOT_ALLOWED', null, 'a doctor cannot redeem');
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.redeem_companion_code('AAA-AAA', 'husband') $$, 'NOT_AUTHENTICATED', null, 'signed-out caller is rejected');

select tests.login_as((select c1 from u));
select throws_ok($$ select public.redeem_companion_code((select code from codes where label = 'a'), 'cousin') $$,
  'INVALID_INPUT', null, 'an unknown relation is rejected');
select throws_ok($$ select public.redeem_companion_code((select code from codes where label = 'a'), null) $$,
  'INVALID_INPUT', null, 'a missing relation is rejected');
select tests.logout();
select is(tests.fails((select c1 from u)), 0, 'a wrong relation is not counted as a guess');
select is((select used_at is null from public.companion_invites), true, 'a wrong relation does not consume the invite');

-- ---- happy path: normalising (case, spaces, dash)
select tests.login_as((select c1 from u));
insert into res select 'first', public.redeem_companion_code(' ' || lower((select code from codes where label = 'a')) || ' ', 'husband');
select isnt((select link from res where label = 'first'), null, 'redeeming with lower case and spaces works');
select is((select status::text from public.companion_links where id = (select link from res where label = 'first')), 'pending', 'link starts pending');
select is((select relation from public.companion_links where id = (select link from res where label = 'first')), 'husband', 'relation is stored');
select is((select count(*)::int from public.companion_links
           where id = (select link from res where label = 'first')
             and not (can_view_appointments or can_view_journey or can_view_summaries
                      or can_view_reports or can_view_prescriptions or receive_notifications)), 1,
          'a pending link grants nothing');
select is((select count(*)::int from public.patients), 0, 'a pending companion cannot read the patient yet');
select tests.logout();
select is((select count(*)::int from public.companion_invites where used_at is not null), 1, 'the invite is marked used');
select is((select count(*)::int from public.code_redeem_attempts where user_id = (select c1 from u) and success), 1, 'the success is logged');

-- ---- single use: the same code again, by the same user and by another companion
select tests.login_as((select c1 from u));
select is(public.redeem_companion_code((select code from codes where label = 'a'), 'husband'), null, 'a used code is rejected (same user)');
select tests.login_as((select c2 from u));
select is(public.redeem_companion_code((select code from codes where label = 'a'), 'friend'), null, 'a used code is rejected (other user)');
select tests.logout();
select is(tests.fails((select c2 from u)), 1, 'the failed attempt is recorded');

-- ---- unknown, malformed and look-alike codes are failures, not errors
select tests.login_as((select c2 from u));
select is(public.redeem_companion_code('ZZZ-ZZZ', 'friend'), null, 'an unknown code returns null');
select is(public.redeem_companion_code('AB', 'friend'), null, 'a short code returns null');
select is(public.redeem_companion_code(null, 'friend'), null, 'a null code returns null');
select is(public.redeem_companion_code('I0O1LL', 'friend'), null, 'look-alike characters never match');
select tests.logout();
select is(tests.fails((select c2 from u)), 5, 'each of those was logged as a failed attempt');

-- ---- lock-out: 5 failures in the last hour -> RATE_LIMITED, even for a valid code
select tests.login_as((select pat2 from u));
insert into codes select 'b', public.create_companion_invite();
select tests.login_as((select c2 from u));
select throws_ok($$ select public.redeem_companion_code((select code from codes where label = 'b'), 'friend') $$,
  'RATE_LIMITED', null, 'after 5 failures even a valid code is refused');
select tests.logout();
select is((select used_at is null from public.companion_invites where patient_id = (select p2 from pt)), true, 'the locked-out redeem did not use the invite');
select is(tests.fails((select c2 from u)), 5, 'a locked-out call adds no further failure');
select tests.login_as((select c3 from u));
select is(public.redeem_companion_code('ZZZ-ZZZ', 'friend'), null, 'the lock-out is per user (c3 is not locked)');
select tests.logout();
-- the window slides: failures older than an hour stop counting
update public.code_redeem_attempts set attempted_at = now() - interval '61 minutes' where user_id = (select c2 from u);
select tests.login_as((select c2 from u));
insert into res select 'second', public.redeem_companion_code((select code from codes where label = 'b'), 'friend');
select isnt((select link from res where label = 'second'), null, 'after an hour the user can redeem again');

-- ---- expiry
select tests.login_as((select pat from u));
insert into codes select 'c', public.create_companion_invite();
select tests.logout();
update public.companion_invites set expires_at = now() - interval '1 minute'
  where patient_id = (select p1 from pt) and revoked_at is null and used_at is null;
select tests.login_as((select c3 from u));
select is(public.redeem_companion_code((select code from codes where label = 'c'), 'sibling'), null, 'an expired code is rejected');

-- ---- revoked invite: regenerating revokes the old code
select tests.login_as((select pat from u));
insert into codes select 'd', public.create_companion_invite();
insert into codes select 'e', public.create_companion_invite();
select tests.login_as((select c3 from u));
select is(public.redeem_companion_code((select code from codes where label = 'd'), 'sibling'), null, 'a revoked (replaced) code is rejected');

-- ---- duplicate link: pending or approved -> ALREADY_LINKED, and the invite stays usable
select tests.login_as((select c1 from u));
select throws_ok($$ select public.redeem_companion_code((select code from codes where label = 'e'), 'husband') $$,
  'ALREADY_LINKED', null, 'a companion with a pending link cannot redeem again');
select tests.login_as((select pat from u));
select public.decide_companion_link((select link from res where label = 'first'), true, '{"journey": true}');
select tests.login_as((select c1 from u));
select throws_ok($$ select public.redeem_companion_code((select code from codes where label = 'e'), 'husband') $$,
  'ALREADY_LINKED', null, 'a companion with an approved link cannot redeem again');
select tests.logout();
select is((select used_at is null from public.companion_invites where patient_id = (select p1 from pt) and revoked_at is null), true,
          'ALREADY_LINKED leaves the invite unused');

-- ---- after a rejection or leaving, the same companion can link again
select tests.login_as((select c1 from u));
select public.end_companion_link((select link from res where label = 'first'));
insert into res select 'again', public.redeem_companion_code((select code from codes where label = 'e'), 'husband');
select isnt((select link from res where label = 'again'), null, 'a companion who left can request again with a fresh code');

-- ---- companions cannot touch the tables
select throws_ok(
  $$ insert into public.companion_links (patient_id, companion_user_id, relation, status)
     values ((select p1 from pt), (select c3 from u), 'friend', 'approved') $$,
  '42501', null, 'a companion cannot insert a link directly');
select is((select count(*)::int from public.code_redeem_attempts), 0, 'a companion cannot read the attempts log');

select * from finish();
rollback;
