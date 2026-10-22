# Brief: admin agent

Branch `agent/admin`. Read AGENTS.md, docs/contracts.md, docs/ui-kit.md, docs/local-dev.md first.

## Goal
Hospital management (PLAN.md §7.6, Phases 1 and 8): staff users, patient/pregnancy data
management, care-team reassignment, data-quality center, configuration editors, audit viewer,
DPDP requests, dashboard. Plus the shared Profile screen.

## You own
- `app/admin/**`, `app/profile.tsx`, `src/features/admin/**`, `src/i18n/en/admin.json`
- `supabase/functions/admin-users/**`, `supabase/functions/export-patient-data/**`
  (self-contained: do not import from `_shared`, which the backend agent owns)
- Migrations `20261027000000`-`20261027999999`, tests `supabase/tests/admin_*.test.sql`,
  optional `supabase/seeds/admin.sql` (e.g. one failing example per data-quality rule)

## Build
1. **`admin-users` Edge Function** (service role, verifies caller `auth_role() = 'admin'` from
   the JWT): `create` (auth.admin.createUser / inviteUserByEmail with `app_metadata.role`, plus
   `profiles.full_name` and a `staff_details` row), `update` (name, designation, specialization,
   registration_no, bio), `set_role`, `set_active` (deactivate/reactivate: `profiles.is_active`),
   `resend_invite`. Profile `role`/`is_active` are NOT writable through PostgREST by design
   (column privileges + trigger) - only via this function. Deno tests run with
   `npm run test:functions`; mock the Supabase client.
2. **`export-patient-data`** (admin; DPDP export as JSON of all rows for one patient), audit
   `action='export'` row.
3. SQL (your range): data-quality functions/views per PLAN §7.6 #4 (no LMP/EDD, GA > 42w active,
   no active primary, care team whose only doctor is deactivated, T3 with no backup, unverified
   app registrations > 14 days, past appointments still booked, consultations without published
   advice, lab values unverified > 48h, AI drafts pending > 24h, patients without an app account,
   implausible vitals); dashboard metrics function; hard delete RPC (reason required, double
   confirmation in UI, audit row). Care-team changes: call doctor's
   `add_backup_doctor` / `remove_care_team_member` / `hand_over_primary` (stubs until merged) or
   write `care_team` directly (admin has `admin_all`).
4. **Profile** (`app/profile.tsx`, every role): edit name/phone (direct update allowed on those
   columns), photo optional, notification preference placeholder, sign out (`signOut` from
   `@/features/auth/session-bootstrap`), **delete my account** -> insert `data_requests`
   (`kind='deletion'`), "export my data" -> `kind='export'`.

## Screens
Dashboard (active pregnancies by trimester, high risk, appointments today/week, no-show rate, AI
pending, unverified values, missed visits); Users (list/create/edit/deactivate/resend/role);
Patients & pregnancies (CRUD, merge via `merge_patients` (reception's stub), fix LMP/EDD, manage
care teams, soft delete/restore, hard delete); Data quality (each item links to a fix screen);
Configuration (booking rules in `hospital_settings`, visit templates standard + high_risk, lab
catalog incl. trimester ranges, drug catalog, curated guidance, week content, milestones,
hospital settings); Audit log viewer (filter user/patient/table/date); Requests.

## Tests (acceptance)
pgTAP: admin-only access to every function/view you add (doctor/receptionist/patient/companion
denied), each data-quality rule detects a seeded failing row and not a healthy one, hard delete
writes an audit row, `data_requests` self-insert/self-read only. Deno: admin-users rejects
non-admin JWTs, validates input. Jest: forms, filters, metrics shaping.

## Do NOT
Edit other roles' screens, shared components, `src/domain`, `src/features/auth`, other
migrations; add packages; never print user emails or patient data to logs.
