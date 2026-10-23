# GARBH: rules for every agent

PLAN.md is the product source of truth. This file is the source of truth for **who may touch what**.
Read this file, then `docs/contracts.md`, `docs/ui-kit.md`, `docs/local-dev.md` and your brief in
`docs/briefs/<agent>.md` before writing code.

## 1. Stack and decisions (do not revisit)

Expo SDK 58 + Expo Router (TypeScript strict), React Native Paper (MD3), TanStack Query, Zustand,
react-hook-form + zod, supabase-js v2 with generated types. One app, role-based UI, single
hospital. Supabase runs **locally only** (`npx supabase`, Docker); never link or push to a cloud
project. Gemini is **mocked** (no real key anywhere). Email OTP auth. English only, but every
user-facing string goes through i18n. Package id `com.garbh.app`. npm only (not pnpm/yarn).

There is no Android SDK or emulator. Verification = typecheck, lint, Jest, Metro bundle, pgTAP.

## 2. Worktree setup and commands

```bash
# from /home/shrey/Desktop/garbh (worktrees must be siblings under /home/shrey/Desktop:
# Docker cannot mount test folders from /tmp sandboxes)
git worktree add ../garbh-<agent> -b agent/<agent> main
cd ../garbh-<agent> && npm ci && cp .env.example .env
```

| Command | What |
|---|---|
| `npm ci` | install (first thing in a new worktree) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm test` | Jest + React Native Testing Library |
| `npm run bundle:check` | Metro-bundles the Android app (catches broken routes/imports) |
| `npm run db:check` | **locks** the shared local Supabase, `db reset` from YOUR worktree, `supabase test db` |
| `npm run db:check -- --types` | same, then regenerates `src/types/database.ts` |
| `npm run test:functions` | Deno tests for Edge Functions, run in Docker (`denoland/deno:2.9.8`) |
| `npm run eval:ai` | AI eval harness over `ai-evals/` (mock provider by default), in Docker |
| `npm run e2e` | role walkthrough against the local stack (after `db:check` + `bash scripts/seed-demo-files.sh`) |

All worktrees share ONE local Supabase stack (project_id `garbh`). Never run `supabase db reset`,
`supabase test db` or `supabase stop` directly: always use `npm run db:check`, which serialises
access with a file lock. Never run `supabase link`, `db push`, `functions deploy`, `login`.

## 3. Definition of done (every agent, every feature)

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run bundle:check` and `npm run db:check` pass.
2. Every policy, trigger and RPC you add has pgTAP tests in your test files: allowed AND denied
   cases per role, plus the "doctor not on the care team sees zero rows" case where relevant.
3. Pure logic (hooks' data shaping, validation, permission hiding) has Jest tests.
4. UI uses `@/components` (see `docs/ui-kit.md`); strings come from your i18n namespace.
5. No PHI in logs: no `console.log` of rows, names, emails, values. (`no-console` is enforced.)
6. Loading, empty and error states exist on every data screen.
7. You touched only files you own (section 5). Anything else goes in your final report.
8. Small logical commits on your branch `agent/<name>`; message body ends with your
   `Co-Authored-By:` line. Do not push, do not merge, do not rebase `main`.

## 4. Conventions

- **Routes.** Role areas are plain folders: `app/patient`, `app/companion`, `app/doctor`,
  `app/reception`, `app/admin` (URLs `/patient/...`). Route groups like `(patient)` are NOT used
  for role areas because groups don't add a URL segment and identical paths (`/patients`) in two
  groups collide. `app/(auth)` holds sign-in/consent/onboarding. Shared: `/notifications`, `/profile`.
  The role router (`src/features/auth/gate.ts`) keeps each role inside its own folder.
- **Data access.** Call Supabase from hooks in your `src/features/<area>/` folder (`api.ts` /
  `hooks.ts`). Use `supabase.rpc('<name>', args)` and `supabase.from('<table>')` with the generated
  types. Query keys start with your area: `['patient', 'appointments']`, `['doctor', 'queue', date]`.
- **Live updates.** `useRealtimeInvalidate({ table, filter, queryKey })` from `@/lib/realtime`.
  Only `appointments`, `notifications`, `companion_links`, `ai_summaries` are in the publication.
- **Errors.** RPCs raise exceptions whose message is an UPPER_SNAKE code from
  `src/domain/rpc-errors.ts`; show `t(rpcErrorKey(error))`. Need a new code? Use the closest
  existing one and request the new code in your report.
- **Dates.** ISO date strings `YYYY-MM-DD` for calendar dates; `src/domain/pregnancy-math.ts` for
  GA/EDD/windows (it mirrors SQL `ga_from_edd`). Timestamps are `timestamptz` ISO strings; display
  in the device timezone with `date-fns`. Hospital "today" in SQL is `public.hospital_today()`.
- **i18n.** `const { t } = useTranslation('<your-namespace>')`; common strings: `t('common:...')`
  or `useTranslation()` (default namespace `common`).
- **SQL.** Every new function: `security definer` only when needed, always `set search_path = ''`,
  fully-qualified names, and end your migration with
  `revoke execute on function public.<fn>(<args>) from public, anon; grant execute on function public.<fn>(<args>) to authenticated;`
  (the head's CI test fails if anon can execute any public function). Internal helpers and
  trigger functions go in schema `private`. New tables: `alter table ... enable row level security`
  (CI test fails otherwise) and attach `private.audit_row()` if clinical. Policy names:
  `<table>_<who>_<op>`, always `to authenticated`.
- **Stubbed RPCs.** `supabase/migrations/20261023001200_domain_rpc_stubs.sql` declares every
  cross-agent RPC. The owner implements it with `create or replace function` in their own range,
  keeping the signature **byte-for-byte identical** (names, types, defaults, return type).
  Until merged, consumers get `NOT_IMPLEMENTED`; code against the contract and mock it in Jest.
- **Generated types.** `src/types/database.ts` is generated. If your migration adds/changes
  public tables, views or functions, regenerate it with `npm run db:check -- --types` and commit
  it in a separate commit titled `Regenerate database types`. On merge conflicts the head
  regenerates it; never hand-edit it.

## 5. File ownership map

Only the owner edits a path. "head" = the head engineer (foundation + reviews).

| Path | Owner |
|---|---|
| `PLAN.md`, `AGENTS.md`, `docs/**` | head |
| `package.json`, `package-lock.json`, `.npmrc`, `app.config.ts`, `eas.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `jest.setup.js`, `scripts/**` | head |
| `supabase/config.toml`, `supabase/seed.sql`, `supabase/templates/**` | head |
| `supabase/migrations/20261023*` (foundation) | head |
| `supabase/tests/head_*.test.sql`, `supabase/tests/helpers/setup.psql` | head |
| `src/components/**` (incl. QueryBoundary, ConfirmDialog, ChoiceChips, SlotPicker), `src/lib/{env,secure-storage,supabase,query-client,session,realtime}.ts` + their tests | head |
| `src/domain/**` (pregnancy-math, permissions, rpc-errors, schemas/{auth,onboarding,ai-summary}) | head |
| `src/types/database.ts` | generated (see 4) |
| `src/i18n/index.ts`, `src/i18n/en/common.json` | head |
| `src/test-utils/**`, `src/features/auth/**` | head |
| `app/_layout.tsx`, `app/index.tsx`, `app/(auth)/**` | head |
| `app/patient/**` **except** `app/patient/companions/**` | patient |
| `src/features/patient/**`, `src/i18n/en/patient.json` | patient |
| `app/companion/**`, `app/patient/companions/**` | companion |
| `src/features/companion/**`, `src/i18n/en/companion.json` | companion |
| `app/doctor/**`, `src/features/doctor/**`, `src/i18n/en/doctor.json` | doctor |
| `app/reception/**`, `src/features/reception/**`, `src/i18n/en/reception.json` | reception |
| `app/admin/**`, `app/profile.tsx`, `src/features/admin/**`, `src/i18n/en/admin.json` | admin |
| `supabase/functions/admin-users/**`, `supabase/functions/export-patient-data/**` | admin |
| `app/notifications.tsx`, `src/features/notifications/**`, `src/lib/push.ts` (new), `src/i18n/en/backend.json` | backend |
| `supabase/functions/_shared/**`, `process-report/**`, `summarize-consultation/**`, `summarize-pregnancy/**`, `send-push/**`, `supabase/functions/.env.example`, `supabase/functions/deno.json` | backend |
| `ai-evals/**` (synthetic sample reports + `run.mts`, run with `npm run eval:ai`) | backend |
| Your migrations: `supabase/migrations/<your range>_*.sql` | you |
| Your pgTAP: `supabase/tests/<agent>_NN_<topic>.test.sql`, optional `supabase/tests/helpers/<agent>.psql` | you |
| Your demo data: `supabase/seeds/<agent>.sql` (runs after `seed.sql`, alphabetical; SQL only, no storage objects) | you |
| Demo storage files: `scripts/seed-demo-files.sh` (run after every reset); `scripts/e2e-walkthrough.mts` | head |

### Migration timestamp ranges (filename `YYYYMMDDHHMMSS_<owner>_<topic>.sql`)

| Owner | Range (inclusive) | Example |
|---|---|---|
| head (foundation) | `20261023000000`-`20261023999999` | `20261023001300_rls_foundation.sql` |
| reception | `20261024000000`-`20261024999999` | `20261024000100_reception_booking_rpcs.sql` |
| doctor | `20261025000000`-`20261025999999` | `20261025000100_doctor_clinical_writes.sql` |
| companion | `20261026000000`-`20261026999999` | `20261026000100_companion_rpcs.sql` |
| admin | `20261027000000`-`20261027999999` | `20261027000100_admin_data_quality.sql` |
| patient | `20261028000000`-`20261028999999` | (expected: none) |
| backend | `20261029000000`-`20261029999999` | `20261029000100_backend_notifications.sql` |
| head (post-merge fixes) | `20261030000000` and later | |

Never edit a migration you don't own, including the foundation. Need a schema change (new
column, changed constraint, new enum value, new dependency, shared component change, new error
code, seed rows in `seed.sql`)? **Do not make it.** Work around it if you can, and list it under
"Requests for head" in your final report with the exact change and why.

### Dependency / request rule

You may not add npm packages, Expo config plugins, or edit shared files. Already installed for
you (PLAN.md §3): expo-notifications, expo-device, expo-document-picker, expo-image-picker,
expo-image-manipulator, expo-file-system, react-native-webview, react-native-svg,
expo-linear-gradient, react-native-gifted-charts, expo-screen-capture, expo-clipboard,
@react-native-community/datetimepicker, date-fns. Anything else: request it.

## 6. Who owns which RPC / policy set

Full contracts (signatures, rules, error codes): `docs/contracts.md`.

| Item | Owner | Consumers |
|---|---|---|
| Helpers `auth_role, is_staff, my_patient_id, companion_can, on_care_team, on_patient_care_team, is_primary_doctor, can_view_pregnancy, hospital_today, ga_from_edd, gestational_age` | head (done) | all |
| `generate_visit_plan` + EDD-shift trigger | head (done) | doctor, reception |
| `complete_signup`, `record_consent`, `log_sensitive_view` | head (done) | app shell, doctor, admin |
| Auth trigger (+ desk-patient email linking), role guard, patient column guard, appointment care-team trigger, audit trigger | head (done) | all |
| RLS: enabled everywhere, `<table>_admin_all`, ALL select policies (§4 matrix), profile/staff/availability/time-off/data_requests/patient-contact writes | head (done) | all |
| Views `doctor_directory`, `published_summaries` | head (done) | patient, companion, reception, doctor |
| `verify_patient`, `merge_patients`, `available_slots`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `set_appointment_status` (stubbed) | **reception** | patient, doctor, admin |
| New: `register_patient`, `mark_visit_contacted`; write policies on `patients` (receptionist) | reception | admin (may reuse) |
| `add_backup_doctor`, `remove_care_team_member`, `hand_over_primary` (stubbed) | **doctor** | admin |
| Write policies: `pregnancies`, `visits`, `consultations`, `consultation_private_notes`, `prescription_items`, `reports`, `report_files`, `lab_results`, `patients` (doctor, care team) | doctor | patient/companion read them via head's policies |
| `create_companion_invite`, `redeem_companion_code`, `decide_companion_link`, `end_companion_link` (stubbed); invite pepper; rate limit | **companion** | patient (My Companions screens are owned by companion) |
| `review_ai_summary` (stubbed); `notifications` mark-read + `push_tokens` policies; storage policies on bucket `reports`; notification triggers for every §11 event; `send-push` + `pg_net`; `pg_cron` jobs §8.6; AI Edge Functions with mock Gemini; full RLS read matrix pgTAP | **backend** | doctor (AI inbox), everyone (notifications) |
| `admin-users`, `export-patient-data` Edge Functions; data-quality + dashboard SQL; admin mutations; `data_requests` processing | **admin** | - |
| Patient UI (home, journey, booking incl. first booking, appointments, my doctors, reports, trends, care guide, prescriptions) | **patient** | - |

## 7. Final report format (each agent)

Under 60 lines: what you built (routes, RPCs, policies, tests), command results, deviations from
PLAN.md, **Requests for head** (exact shared-file changes / deps / error codes / seed rows),
contracts you assumed, open questions, and what does not work yet.
