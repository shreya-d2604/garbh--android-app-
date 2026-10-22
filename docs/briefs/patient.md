# Brief: patient agent

Branch `agent/patient`. Read AGENTS.md, docs/contracts.md, docs/ui-kit.md, docs/local-dev.md first.

## Goal
The pregnant patient's app (PLAN.md §7.2): warm, simple, reassuring, works for a low-literacy
first-time smartphone user. Mostly UI + queries; you are not expected to write SQL.

## You own
- `app/patient/**` **except** `app/patient/companions/**` (companion agent), including the
  placeholder `app/patient/_layout.tsx`, `index.tsx`, `first-booking.tsx`
- `src/features/patient/**`, `src/i18n/en/patient.json`
- Migrations `20261028000000`-`20261028999999` (expected unused), tests `patient_*`, `supabase/seeds/patient.sql`

## Screens
1. **Tabs layout**: Home, Journey, Appointments, Reports, More (My doctors, Care guide,
   Prescriptions, My companions -> `/patient/companions`, Profile). Keep 4-5 tabs.
2. **Home**: journey card ("Week 22 + 3 days · 2nd Trimester", progress ring to EDD, baby size
   from `week_content`, days to go), next appointment (live), latest published summary headline +
   3 key points (`published_summaries`), today's medicines (`prescription_items` where
   `is_active` and today between `start_date`/`end_date`), alerts (e.g. a planned visit window
   open and not booked). **Unverified** banner: "Bring a photo ID..." (`patients.is_verified`).
3. **Journey**: trimester timeline with "you are here", milestone path joining `milestones`,
   `visits` (status), current week; week-by-week swiper (`week_content`); "What's next".
   GA from `src/domain/pregnancy-math.ts` using `pregnancies.edd_final` (or SQL `gestational_age`).
4. **Appointments**: upcoming/past (live, `useRealtimeInvalidate` with `patient_id=eq.<id>`),
   status timeline; `[id]` detail; **book** flow `/patient/appointments/book?visit=<id>`
   (pre-filled from next planned visit, choose care-team doctor primary first, date strip of
   `available_slots`, confirm -> `book_appointment`; soft warning outside the visit window;
   "That slot was just taken" on `SLOT_TAKEN` with refreshed slots); reschedule/cancel until the
   cutoff, then "Please call reception" with tap-to-call (`hospital_settings.phone`).
5. **First booking** (`/patient/first-booking`, reached right after onboarding): pick a doctor
   with `accepts_new_patients` from `doctor_directory` -> slot -> book. "Skip for now" allowed.
6. **My doctors**: active care team (primary, then backups) joined with `doctor_directory`.
7. **Reports & summaries**: list grouped by trimester, "Doctor reviewed" chip; report detail with
   file viewer (signed URL, `react-native-webview` for PDF / `Image` for photos), verified values
   with low/high chips, linked summary; `/patient/reports/summaries/[id]`; **Trends** charts (Hb,
   weight, BP, sugar) with `react-native-gifted-charts`, verified values only.
8. **Care guide**: `curated_guidance` (filtered by trimester / patient conditions) merged and
   de-duplicated with the latest published summary's foods/medicines lists; label each item
   "Advised by Dr. X" or "General guidance"; warning signs always shown.
9. **Prescriptions**: current medicines + history per published consultation with advice text.
- Use `expo-screen-capture` (`usePreventScreenCapture`) on report and summary screens (PLAN §12).
- Deep-link routes you must provide: see docs/contracts.md §6 table (patient column).

## Contracts you consume (mock in Jest; stubs raise NOT_IMPLEMENTED until merged)
`available_slots`, `book_appointment`, `reschedule_appointment`, `cancel_appointment` (reception);
storage signed URLs (bucket policies by backend: until merged, reading files fails, so handle errors);
everything else is read through head's RLS policies, already live.

## Tests (acceptance)
Jest: journey data shaping (milestone path, what's next), alerts logic, care-guide merge/dedupe,
booking flow state (slot taken -> refresh), cutoff check helper, unverified limit messaging,
"today's medicines" filter. Screens render with mocked hooks. Optional pgTAP `patient_*` only if
you discover an RLS gap (report it instead of fixing shared policies).

## Do NOT
Edit `app/patient/companions/**`, shared components, `src/domain`, migrations of others, or add
packages. Do not write directly to `appointments` (RLS forbids it) - only the RPCs.
