# Brief: doctor agent

Branch `agent/doctor`. Read AGENTS.md, docs/contracts.md, docs/ui-kit.md, docs/local-dev.md first.

## Goal
The doctor's clinical workspace (PLAN.md §7.4, Phases 2 and 4): today's queue, care-team
patient list, chart, consultation form with manual prescriptions, reports upload, visit plan
editor, pregnancy management, schedule, and the AI review screens (UI only). Plus all clinical
WRITE policies and the care-team RPCs.

## You own
- `app/doctor/**`, `src/features/doctor/**`, `src/i18n/en/doctor.json`
- Migrations `20261025000000`-`20261025999999`, tests `supabase/tests/doctor_*.test.sql`,
  optional `supabase/seeds/doctor.sql`

## SQL to build
1. `add_backup_doctor`, `remove_care_team_member`, `hand_over_primary` (replace stubs;
   docs/contracts.md §3). Admin may call them too.
2. Write policies (care team = `public.on_care_team(pregnancy_id)`; admin already has `admin_all`):
   `pregnancies` update (LMP/EDD/`lmp_source`, risk, outcome/close), `visits` insert/update/delete
   (extra visits with `is_extra` + `reason_added`, move/skip/cancel, edit tests), `consultations`
   insert (doctor_id = auth.uid()) / update, `consultation_private_notes` all,
   `prescription_items` all, `reports` insert/update (soft delete via `deleted_at`),
   `report_files` insert/delete, `lab_results` insert/update (manual entry with
   `source='manual'`, verify), `patients` update for care-team doctors (medical fields).
   Optional own RPC `apply_visit_template(p_pregnancy uuid, p_schedule text)` to switch to the
   `high_risk` template (replace still-`planned`, non-extra visits).
3. Clinical tables are already audited by `private.audit_row()`; call
   `log_sensitive_view(patient_id, 'patients', null)` when a chart opens.

## Screens
- Tabs: Today, Patients, AI inbox, Schedule.
- **Today**: live queue (`useRealtimeInvalidate` on `appointments` with `doctor_id=eq.<me>`):
  Booked -> Checked in -> In consultation -> Done, "App" chip for `booking_channel='app'`,
  "New · Unverified" chip. Start consultation -> `set_appointment_status(..., 'in_consultation')`.
- **Patients**: care-team patients only (RLS), search name/MRN, filters primary/backup, high
  risk, trimester, overdue visits.
- **Chart** `/doctor/patient/[pregnancyId]`: header (age, G/P/A/L, blood group, Rh, allergies as
  red chips, GA/trimester, EDD, risk, "Unverified / LMP patient-reported" chip, care team),
  **care team panel** (primary: add backup with note, remove, hand over; backups read-only),
  tabs Timeline / Vitals trends (`react-native-gifted-charts`) / Reports / Prescriptions /
  Visit plan / AI summaries.
- **Consultation** `/doctor/consult/[appointmentId]`: one sectioned form (vitals, obstetric
  exam, complaints/findings, advice shown to patient, manual prescription rows with
  `drug_catalog` autocomplete and "copy from last visit", private notes, next visit), autosave
  draft, **Publish** sets `published_at` and optionally invokes `summarize-consultation`;
  then `set_appointment_status(..., 'completed')`. Flag out-of-range vitals (e.g. BP 300/20).
- **Add report**: type, date, files (multi-page photos via `expo-image-picker` +
  `expo-image-manipulator` compression, or PDF via `expo-document-picker`), upload to bucket
  `reports` at `{patient_id}/{pregnancy_id}/{report_id}/{file_id}.{ext}` with progress, insert
  `reports` + `report_files`, then "Extract & summarise with AI" -> `process-report`.
- **AI inbox / review** `/doctor/ai-inbox/[summaryId]`: realtime badge (`ai_summaries`,
  status draft), split view original file | extracted values (editable, low confidence
  highlighted) | summary sections (editable, `aiSummaryDocumentSchema`); actions Approve &
  Publish / Save draft / Reject -> `review_ai_summary`, Regenerate -> invoke the function again.
- **Visit plan editor**, **pregnancy management** (LMP/dating-scan EDD, risk, outcome),
  **My schedule** (weekly `doctor_availability`, `doctor_time_off` with clash list of booked
  appointments, "Accepting new patients" toggle on `staff_details`).
- `usePreventScreenCapture` on chart/report/summary screens. Deep-link routes: contracts §6.

## Contracts you consume
`set_appointment_status` (reception), `review_ai_summary` + Edge Functions `process-report`,
`summarize-consultation`, `summarize-pregnancy` (backend), storage policies (backend). Mock them
in Jest; they return NOT_IMPLEMENTED / 404 until merged.

## Tests (acceptance)
pgTAP per PLAN §13: every clinical write allowed for care-team doctors (primary and backup),
denied for non-team doctors, receptionists, patients, companions; a removed backup loses write
access at once; a backup cannot add/remove doctors or hand over; primary hand-over; cannot
remove the primary; patient can't see private notes ever; unpublished consultation invisible to
patient. Jest: consultation form schema (vitals ranges), prescription row helpers (copy from last
visit, end date), queue grouping, filters.

## Do NOT
Write notification inserts (backend triggers do it), storage policies (backend), shared
components, `src/domain`, other migrations; add packages.
