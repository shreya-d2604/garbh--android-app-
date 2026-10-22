# Brief: backend agent

Branch `agent/backend`. Read AGENTS.md, docs/contracts.md, docs/ui-kit.md, docs/local-dev.md first.

## Goal
Server-side plumbing (PLAN.md §8.2, §8.5, §8.6, §9, §11, Phases 5-6): the AI pipeline with a
mocked Gemini, notifications end to end, scheduled jobs, storage policies, and the full RLS read
matrix that proves the security boundary.

## You own
- `supabase/functions/_shared/**` (gemini.ts provider wrapper, schemas.ts, auth.ts),
  `process-report/**`, `summarize-consultation/**`, `summarize-pregnancy/**`, `send-push/**`,
  `supabase/functions/deno.json`, `supabase/functions/.env.example`
- `app/notifications.tsx`, `src/features/notifications/**`, `src/lib/push.ts` (new),
  `src/i18n/en/backend.json`
- Migrations `20261029000000`-`20261029999999`, tests `supabase/tests/backend_*.test.sql`,
  optional `supabase/seeds/backend.sql`

## Build
1. **AI provider wrapper** `_shared/gemini.ts`: interface `AiProvider { extractReport(...),
   summarizeConsultation(...), summarizePregnancy(...) }`; `MockProvider` (deterministic,
   schema-valid output, honours a few report types; can simulate failure for tests) and
   `GeminiProvider` (structured output per PLAN §9.1-9.4, model from `GEMINI_MODEL`; never called
   in this phase). Selection by env `AI_PROVIDER` (`mock` default). No key in the repo; document
   `GEMINI_API_KEY` only in `.env.example` with an empty value.
2. **Functions** `process-report`, `summarize-consultation`, `summarize-pregnancy`
   (docs/contracts.md §5): verify the JWT user is a care-team doctor (call
   `on_care_team` via the user-scoped client), build de-identified context (PLAN §9.2, never
   name/MRN/phone/email/address/doctor names), call provider, validate with zod
   (`_shared/schemas.ts`, same shape as `src/domain/schemas/ai-summary.ts`), map test names to
   `lab_tests.code`, compute flags vs ranges (trimester-aware), insert `lab_results`
   (`source='ai_extracted'`, `verified=false`) and `ai_summaries` (`status='draft'`), retry once
   then `status='failed'` with `error`; per-doctor rate limit (100/h).
3. **`review_ai_summary`** (replace stub, contracts §5). Publishing strips
   `doctor_attention_flags`, verifies the report's lab values, notifies.
4. **Notifications**: policies `notifications_self_update` (only `read_at`; use column grant)
   and `push_tokens` self insert/update/delete; triggers producing every row of PLAN §11 with
   the `data.route` targets in contracts §6 and non-sensitive push text (appointments insert/update,
   `patients.verified_at`, consultations `published_at`, ai_summaries draft/published,
   companion_links, care_team changes, check-in). Companions only when approved + matching
   permission + `receive_notifications`. Reception sees app bookings live, no notification.
5. **send-push** via `pg_net` (create extensions `pg_net`, `pg_cron` in your migration) calling
   the function (local URL `http://kong:8000/functions/v1/send-push`), Expo Push API call behind
   an interface (mock in tests, no real network), delete `DeviceNotRegistered` tokens.
6. **pg_cron** jobs PLAN §8.6 (reminders 24h/2h with `reminder_*_sent_at`, visit due, missed
   visits, week milestone, expire invites, data-quality nudges). Put job bodies in `private`
   functions so they are testable in pgTAP without waiting for cron.
7. **Storage policies** on `storage.objects` for bucket `reports` (PLAN §6 "Storage"): parse the
   second path segment as `pregnancy_id`; care-team doctors + admin write/read; patient and
   companions with `reports` read.
8. **App**: `app/notifications.tsx` inbox (live via `useRealtimeInvalidate` on `notifications`,
   mark read, tap -> `router.push(data.route)`); `src/lib/push.ts` exporting
   `usePushRegistration()` (expo-notifications + expo-device, upsert `push_tokens`). The head
   mounts it in `app/_layout.tsx` at merge: say so in your report.
9. **RLS read matrix** `backend_*_rls_matrix.test.sql`: for each role (admin, care-team doctor,
   non-team doctor, receptionist, patient, other patient, companion with/without each
   permission, revoked companion) x every public table x SELECT: expected visible rows. Plus
   storage object access. (Write policies are tested by their owners.)

## Tests (acceptance)
pgTAP for 3-9; Deno tests (`npm run test:functions`) for auth checks, schema validation,
de-identification, mock provider, failure/retry path, rate limit, send-push token pruning.
Jest for the inbox and push registration logic. Only `npm:` imports in Deno code.

## Do NOT
Call any real external API (Gemini, Expo push) or add secrets; edit role screens, shared
components, `src/domain`, other migrations; add npm packages.
