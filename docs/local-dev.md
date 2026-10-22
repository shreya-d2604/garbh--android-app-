# Local development

Everything runs on this machine. There is no cloud Supabase project; never run `supabase link`,
`db push`, `functions deploy` or `login`.

## Prerequisites

Node 24 / npm 11, Docker. (No Android SDK here, so verification is typecheck, lint, Jest,
`npm run bundle:check` and pgTAP.)

```bash
npm ci
npm run db:check            # starts the stack if needed, db reset (migrations + seed), pgTAP
npx supabase status         # URLs and keys
cp .env.example .env        # paste ANON_KEY from `npx supabase status` into EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Local URLs: API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`,
Mailpit (captured emails) `http://127.0.0.1:54324`, Postgres `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

On a phone or emulator replace `127.0.0.1` in `.env` with the machine's LAN IP (emulator: `10.0.2.2`).
Push notifications and some native modules need a development build (`eas build --profile development`),
not Expo Go.

## Signing in locally (email OTP via Mailpit)

1. In the app enter one of the seeded emails below (or any new email to test onboarding).
2. Open Mailpit at http://127.0.0.1:54324, open "Your GARBH sign-in code", copy the 6 digits.
3. Enter the code. The role router opens the right area. Codes expire after 10 minutes.

Without the app (e.g. to get a JWT for curl):

```bash
ANON=$(npx supabase status -o json | python3 -c 'import sys,json;print(json.load(sys.stdin)["ANON_KEY"])')
curl -s -X POST http://127.0.0.1:54321/auth/v1/otp -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"email":"kavya@garbh.test"}'
# read the code from Mailpit (UI, or GET http://127.0.0.1:54324/api/v1/search?query=to:kavya@garbh.test)
curl -s -X POST http://127.0.0.1:54321/auth/v1/verify -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d '{"type":"email","email":"kavya@garbh.test","token":"123456"}'    # -> access_token
```

## Seeded users (supabase/seed.sql)

| Email | Role | Notes |
|---|---|---|
| admin@garbh.test | admin | |
| dr.asha@garbh.test | doctor | accepts new patients; primary for Priya, Sunita, Kavya |
| dr.meera@garbh.test | doctor | primary for Anjali, backup for Kavya |
| reception@garbh.test | receptionist | |
| priya@garbh.test | patient | 9w2d, verified (GH-0001) |
| sunita@garbh.test | patient | 16w4d, verified, Rh-negative, penicillin allergy |
| kavya@garbh.test | patient | 24w3d, verified; past published consultation, 2 prescriptions, CBC report with verified Hb/TSH, published AI summary, appointment today 11:00 |
| anjali@garbh.test | patient | 33w0d, high risk (GDM); appointment tomorrow; AI draft pending |
| neha@garbh.test | patient | 7w1d, self-registered, **unverified**, no MRN, no care team |
| rahul@garbh.test | companion | approved for Kavya (appointments, journey, summaries) |
| any other email | none | goes through consent -> "Who are you?" onboarding |

Gestational weeks are computed from "today" at reset time, so they stay meaningful.
Seed user ids are fixed (`00000000-0000-4000-a000-0000000000NN`), see `seed.sql`.

## Database workflow

- Migrations: `supabase/migrations/<timestamp>_<owner>_<topic>.sql` in your range (AGENTS.md §5).
- Demo data for your feature: `supabase/seeds/<agent>.sql` (runs after `seed.sql`).
- Tests: `supabase/tests/<agent>_NN_<topic>.test.sql`. Start every file with:

```sql
begin;
\ir helpers/setup.psql
select plan(N);
-- tests.create_user(email, role default null) -> uuid   (role via app_metadata, consent pre-set)
-- tests.login_as(uuid) / tests.logout()                  (switch to authenticated + JWT claims / back to postgres)
-- tests.create_pregnancy(patient_user uuid, primary_doctor uuid, weeks int default 20) -> pregnancy uuid
...
select * from finish();
rollback;
```

Remember `grant select on <temp table> to authenticated;` if a test reads a temp table after
`tests.login_as(...)`. See `supabase/tests/head_03_core_rls.test.sql` for the pattern.

- `npm run db:check` (always via the lock) / `npm run db:check -- --types` to regenerate types.
- Inspect: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Edge Functions

Deno is not installed locally; `npm run test:functions` runs `deno test` in the
`denoland/deno:2.9.8` Docker image against `supabase/functions`. Use only `npm:` specifiers
(npm registry) for dependencies; do not import from `jsr:`/`https:` URLs. AI is mocked
(`AI_PROVIDER=mock`, see `supabase/functions/.env.example` once the backend agent adds it).
