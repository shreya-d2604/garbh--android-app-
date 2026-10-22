# Brief: companion agent

Branch `agent/companion`. Read AGENTS.md, docs/contracts.md, docs/ui-kit.md, docs/local-dev.md first.

## Goal
The whole companion feature (PLAN.md §7.3, §8.1, Phase 7): the patient's "My Companions"
screens, the code -> request -> approve -> limited view flow, and the read-only companion app.

## You own
- `app/companion/**` (replace the placeholder layout/home), `app/patient/companions/**`
- `src/features/companion/**`, `src/i18n/en/companion.json`
- Migrations `20261026000000`-`20261026999999`, tests `supabase/tests/companion_*.test.sql`,
  optional `supabase/seeds/companion.sql`

## SQL to build (docs/contracts.md §4; keep stub signatures identical)
`create_companion_invite`, `redeem_companion_code`, `decide_companion_link`, `end_companion_link`.
Pepper: a `private.app_secrets(key text primary key, value text)` table (or similar, in `private`)
filled with `encode(extensions.gen_random_bytes(32),'hex')` by your migration; hash with
`extensions.digest(code || pepper, 'sha256')`. One active invite per patient. Rate limit via
`code_redeem_attempts` (> 5 failures/hour -> RATE_LIMITED). Verified patients only can invite.
Notifications for requests/decisions are produced by the backend agent's triggers on
`companion_links`; don't insert notifications yourself.

## Screens
- **Patient side** `app/patient/companions/`: index (approved companions + pending requests),
  invite (generate code, big `XXX-XXX`, copy with `expo-clipboard`, share via RN `Share`,
  expiry countdown), request review (approve with permission toggles, or reject), companion
  detail (edit permissions, revoke with confirmation). Unverified patient: explain that companions
  unlock after desk verification. Live via `useRealtimeInvalidate({ table: 'companion_links', ... })`.
  The patient agent links to `/patient/companions`; you provide `_layout.tsx` (Stack) inside it.
- **Companion side** `app/companion/`: first run = code entry + relation picker
  (husband, mother, father, mother_in_law, father_in_law, sibling, friend, other) ->
  "Waiting for approval" (live). Patient switcher when linked to several patients (selected
  patient in a small Zustand store in your feature folder). Read-only sections under
  `app/companion/[patientId]/` - home, journey, appointments, summaries, reports, prescriptions -
  each **hidden, not disabled**, when its permission is off (`companionCanView` from
  `@/domain/permissions`). "Leave" (`end_companion_link`). Deep-link routes: docs/contracts.md §6.
- Data comes through head's RLS read policies (already live), which already apply the
  permission flags; build your own query hooks keyed by `patientId` with the UI kit. Some UI will
  resemble the patient agent's; duplication is accepted for now (the head consolidates later).

## Tests (acceptance)
pgTAP: invite only by verified patient, one active invite, code shown once (hash stored),
expiry, reuse, revoked invite, rate limit lockout, wrong relation, duplicate link, approve/reject
only by the owning patient, permission update, revoke/leave, revoked companion immediately sees
zero rows in every clinical table and `patients`. Jest: code formatting/normalising, permission
-> visible sections, switcher store.

## Do NOT
Edit other patient screens, shared components, `src/domain`, other migrations; add packages.
