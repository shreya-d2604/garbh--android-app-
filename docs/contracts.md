# Cross-agent contracts

Everything here already exists in the database (as a working function or as a stub raising
`NOT_IMPLEMENTED`) and in `src/types/database.ts`. Owners implement; consumers code against this
page and mock in Jest. Signatures must not change (see AGENTS.md §4 "Stubbed RPCs").

Error convention: `raise exception 'CODE' using detail = '<dev text>'`. Codes are listed in
`src/domain/rpc-errors.ts` (with English messages in `src/i18n/en/common.json`). The exclusion
constraint `no_doctor_overlap` raises SQLSTATE `23P01`, which the client maps to `SLOT_TAKEN`;
owners should still catch it and re-raise `SLOT_TAKEN`.

Roles below: A admin, D doctor, R receptionist, P patient, C companion. "Caller" = `auth.uid()`.

## 1. Already implemented by head

| Function | Notes |
|---|---|
| `auth_role() -> user_role` | null when not onboarded, inactive or soft-deleted |
| `is_staff()`, `my_patient_id()`, `companion_can(patient, perm)`, `on_care_team(pregnancy)`, `on_patient_care_team(patient)`, `is_primary_doctor(pregnancy)` | PLAN §5.3. `perm`: any, appointments, journey, summaries, reports, prescriptions, notifications |
| `can_view_pregnancy(pregnancy, companion_perm) -> bool` | care-team doctor OR the patient OR companion with that perm (admin is separate) |
| `hospital_today() -> date` | today in `hospital_settings.timezone` |
| `ga_from_edd(edd, on)` / `gestational_age(pregnancy, on default hospital_today())` | returns `weeks, days, trimester, days_to_edd`; invoker rights (RLS applies) |
| `generate_visit_plan(pregnancy)` | idempotent; inserts the active `standard` templates. Called by trigger on pregnancy insert. When `edd_final` changes, only `planned` visits shift by the same number of days |
| `complete_signup(p_kind, p_details)` | see PLAN §5.3; requires `record_consent()` first. Errors: NOT_AUTHENTICATED, NOT_ALLOWED, CONSENT_REQUIRED, ALREADY_ONBOARDED, INVALID_INPUT |
| `record_consent()` | stamps `profiles.consent_at` and the caller's `patients.consent_*` |
| `log_sensitive_view(p_patient, p_table, p_record default null)` | doctors/admins call when opening a chart (PLAN §0 "every view is audit-logged") |
| `private.audit_row()` | attach to any new clinical table |

Views: `doctor_directory(id, full_name, avatar_path, designation, specialization, bio, accepts_new_patients)`
for every onboarded user; `published_summaries(id, pregnancy_id, source_type, source_id, final, reviewed_by, published_at)`
returns only `published` rows the caller may see (patient, companion with `summaries`, care-team
doctor, admin) with `doctor_attention_flags` stripped. Patients/companions never read `ai_summaries`.

Auth trigger: a new auth user gets `role` from `raw_app_meta_data.role` (service role only). If
none, and the email matches a verified **desk** patient without an account, the user is linked to
that patient and becomes `patient` (this is the "app invite": tell the patient to sign in with the
email given at the desk). Otherwise `role = null` -> onboarding. GoTrue's admin `createUser` writes
`app_metadata` in an UPDATE after the insert, so a second trigger (`on_auth_user_app_role_updated`)
copies `app_metadata.role` to the profile when the profile has no role yet (it never changes an
existing role).

RLS notes (head migration 20261030000100): a deactivated patient no longer reads her `patients`
row or edits her profile (her own `profiles` row stays readable so the app can show the
"deactivated" notice); doctors read appointments only while on the care team.

## 2. Reception agent

### `available_slots(p_doctor uuid, p_from date, p_to date) -> table(starts_at timestamptz, ends_at timestamptz)`
Callers: P, R, D, A (not companions). Free slots of `p_doctor` between the two dates inclusive (hospital
timezone): `doctor_availability` (weekday, wall-clock times in `hospital_settings.timezone`,
`slot_minutes`) minus `doctor_time_off` minus active appointments (status not cancelled/no_show).
For **patients** also apply `min_lead_hours` / `max_advance_days`, and only return slots for a
doctor on the patient's active care team, or (patient has no active primary) a doctor with
`accepts_new_patients`. Ordered by `starts_at`. Max range 62 days else INVALID_INPUT.

### `book_appointment(p_doctor uuid, p_starts_at timestamptz, p_visit uuid default null, p_pregnancy uuid default null, p_reason text default null) -> uuid`
Returns the appointment id. `ends_at = starts_at + slot_minutes` of the matching availability row.
- Patient path (`auth_role() = 'patient'`): pregnancy = her active pregnancy (`p_pregnancy` ignored
  or must match). Rules (PLAN §5.3, §1 #9): slot must be a real free slot (OUTSIDE_AVAILABILITY /
  DOCTOR_UNAVAILABLE / SLOT_TAKEN), lead time (TOO_SOON), advance window (TOO_FAR_AHEAD), max
  upcoming active appointments: `unverified_max_upcoming` if unverified else
  `verified_max_upcoming` (MAX_UPCOMING), doctor on active care team (NOT_ON_CARE_TEAM). **First
  visit exception:** if the pregnancy has no active primary and the doctor `accepts_new_patients`,
  first insert the doctor into `care_team` as `primary` (`added_by` = caller), then book; if the
  doctor doesn't accept new patients: DOCTOR_NOT_ACCEPTING. `booking_channel = 'app'`.
- Staff path (R/A, and D for own patients): `p_pregnancy` required (INVALID_INPUT); availability /
  time-off / overlap still enforced; lead/advance/max-upcoming not enforced. Channel = role.
- `p_visit` must belong to the pregnancy; set `visits.appointment_id` and `status = 'scheduled'`.
- Status starts as `booked`. `booked_by` = caller.

### `reschedule_appointment(p_appt uuid, p_new_starts_at timestamptz, p_doctor uuid default null) -> uuid`
Cancels the old appointment and books a new one in ONE transaction (same rules as booking for the
caller's role, `p_doctor` default = same doctor), new row has `rescheduled_from = p_appt`, visit link
moves to the new appointment. Patients: own appointment only (NOT_ALLOWED), cutoff
`patient_cancel_cutoff_hours` before the OLD start (CANCEL_CUTOFF). Staff bypass the cutoff.

### `cancel_appointment(p_appt uuid, p_reason text) -> void`
Sets `status = 'cancelled'`, `cancelled_by`, `cancelled_reason`; linked planned visit goes back to
`planned` with `appointment_id = null`. Patients: own + cutoff (CANCEL_CUTOFF). Only `booked`,
`confirmed` can be cancelled (INVALID_STATUS_CHANGE).

### `set_appointment_status(p_appt uuid, p_status appt_status) -> void`
Reception/admin: `booked|confirmed -> checked_in` (sets `checked_in_at`), `-> no_show`,
`-> confirmed`. Doctor (appointment's doctor or care team): `checked_in|booked|confirmed -> in_consultation`,
`in_consultation -> completed` (also marks the linked visit `completed`). Anything else:
INVALID_STATUS_CHANGE. Patients/companions: NOT_ALLOWED.

### `verify_patient(p_patient uuid, p_mrn text, p_merge_into uuid default null) -> void`
R/A only. Sets `verified_at`, `verified_by`, `mrn` (unique: MRN_TAKEN). With `p_merge_into`: merges
the self-registered record into the existing desk record via `merge_patients(p_patient, p_merge_into)`
and verifies the target. Notification to the patient is produced by backend's trigger on
`patients.verified_at` changing from null.

### `merge_patients(p_source uuid, p_target uuid) -> void`
R (only when source is an unverified app record) / A (any). Moves `user_id` (if target has none),
pregnancies (the source's active pregnancy only if target has none active, else source's becomes
`closed`), appointments, companion links; soft-deletes source (`deleted_at`). Audit-logged by
triggers.

Also owned (not stubbed, reception-only): `register_patient(p_details jsonb) -> uuid` (desk
registration: patient verified + MRN, pregnancy with `lmp_source='clinician'`, primary doctor in
care team, visit plan via trigger; duplicate check is a separate query), `mark_visit_contacted(p_visit uuid, p_note text)`,
`next_mrn() -> text` (R/A: suggested next `GH-NNNN`).

**Call notes are staff-only.** `mark_visit_contacted` upserts `visit_contacts(visit_id pk, contacted_at,
contact_note, contacted_by)` (head migration 20261030000100). `visits` has no contact columns any
more, because patients and companions can read `visits`. RLS: receptionist and admin read all,
care-team doctors read their patients', nobody else. Reception embeds it:
`visits.select('..., visit_contacts(contacted_at, contact_note)')`.

Patient bookings take a per-patient advisory lock before the doctor lock, so `MAX_UPCOMING` cannot
be raced by booking two doctors at once.

## 3. Doctor agent

### `add_backup_doctor(p_pregnancy uuid, p_doctor uuid, p_note text default null) -> void`
### `remove_care_team_member(p_pregnancy uuid, p_doctor uuid) -> void`
### `hand_over_primary(p_pregnancy uuid, p_new_primary uuid) -> void`
Caller must be the active primary (`is_primary_doctor`) or admin, else PRIMARY_REQUIRED (doctor) /
NOT_ALLOWED (others). **Exception (decision 2026-10-23):** a backup doctor may call
`remove_care_team_member(p_pregnancy, <her own id>)` to leave the team; the active primary is
notified (`care_team_changed`, "A backup doctor has left a patient's care team."). The primary
cannot leave (INVALID_INPUT: hand over first). Target must be an active doctor profile (INVALID_INPUT). Add: already on the
team -> ALREADY_LINKED. Remove: soft (`removed_at`, `removed_by`); cannot remove the primary
(INVALID_INPUT; hand over first). Hand over: old primary becomes backup, new doctor becomes primary
(removing them as backup first if needed). The backend agent's triggers notify the doctors.

### `apply_visit_template(p_pregnancy uuid, p_schedule text) -> void`
Care-team doctor or admin. `p_schedule` = `standard` | `high_risk` (INVALID_INPUT otherwise; no
EDD: INVALID_INPUT). Replaces the still-`planned`, non-extra visits with the chosen schedule's
templates whose window has not ended; keeps completed/scheduled/missed/skipped/extra visits and
skips template weeks already covered by a kept visit.

Doctor also owns the write policies listed in AGENTS.md §6. Publishing a consultation = setting
`consultations.published_at` (backend's trigger notifies; doctor optionally invokes
`summarize-consultation`).

## 4. Companion agent

### `create_companion_invite() -> text`
Patient only, verified only (NOT_VERIFIED). Revokes any active invite, creates one with
`code_hash = sha256(code || pepper)` (pepper stored in a `private` table created by companion's
migration), `expires_at = now() + 24h`. Returns the plaintext code ONCE, formatted `XXX-XXX`
from alphabet without 0/O/1/I/L (PLAN §8.1).

### `redeem_companion_code(p_code text, p_relation text) -> uuid`
Companion only. Normalises the code (strip `-`/spaces, uppercase). Rate limit: 5 failed
attempts in the last hour -> RATE_LIMITED; logs every attempt in `code_redeem_attempts`.
**Unknown, expired, revoked or used code: returns NULL (no exception)** and logs a failed attempt.
Why: PostgREST runs each RPC in one transaction, so raising INVALID_CODE/CODE_EXPIRED would roll
back the attempt row and the rate limit would never trigger; a single "not valid or expired"
answer also does not tell a guesser that a code once existed. The app maps NULL to
`INVALID_CODE`'s message. Already pending/approved link: ALREADY_LINKED; bad relation:
INVALID_INPUT. On success marks the invite used, creates a `pending` link and returns its id.

### `companion_pregnancy_ids(p_patient uuid) -> setof uuid`
Pregnancy ids of one patient the calling companion follows (any approved link), newest first, so
the app can scope reads; every row is still filtered by RLS.

### `decide_companion_link(p_link uuid, p_approve boolean, p_perms jsonb default '{}') -> void`
Patient owning the link. Pending -> approved (with perms) or rejected. On an approved link with
`p_approve = true` it just updates the permission flags. `p_perms` keys: `appointments, journey,
summaries, reports, prescriptions, notifications` (booleans; missing = false).

### `end_companion_link(p_link uuid) -> void`
Patient: `revoked`. Companion: `left`. Only from pending/approved.

## 5. Backend agent

### `review_ai_summary(p_summary uuid, p_action text, p_final jsonb default null, p_note text default null) -> void`
Care-team doctor (or admin). `p_action`:
- `save_draft`: stores `p_final` as `final` (edits), status stays `draft`.
- `approve_publish`: `final = p_final` (or `draft` if null) validated against PLAN §9.3, with
  `summary.doctor_attention_flags` stripped; `status = 'published'`, `reviewed_by`, `reviewed_at`,
  `published_at`; for report summaries sets `lab_results.verified = true, verified_by` for that
  report; notifications go to patient + permitted companions.
- `reject`: `status = 'rejected'`, `doctor_note = p_note`.
Errors: NOT_ALLOWED, NOT_FOUND, INVALID_STATUS_CHANGE, INVALID_INPUT.

### `register_push_token(p_token text, p_platform text default null) -> void`
Any onboarded, active user. `p_token` must look like `ExponentPushToken[...]` (INVALID_INPUT).
Upserts on the token and moves it to the caller if the device changed hands. Sign-out deletes the
device's row (`push_tokens_self_delete`) before `auth.signOut()`.

### `consume_ai_quota(p_fn text default 'ai') -> void`
Active doctor only (NOT_ALLOWED). Called by the AI Edge Functions with the caller's JWT; 100 calls
per doctor per rolling hour, else RATE_LIMITED.

### `report_object_pregnancy(p_name text) -> uuid`, `consultation_is_published(p_consultation uuid) -> boolean`
Helpers used inside RLS policies (storage path -> pregnancy; published check evaluated as the
owner so a `prescriptions`-only companion sees published prescription items).

**AI summaries:** only a care-team doctor can save, approve or publish; an admin can only `reject`
(decision kept 2026-10-23). Storage: admins may read/write/delete every object in `reports`
(`reports_bucket_admin_all`), needed by the hard delete.

### Edge Functions (invoke with `supabase.functions.invoke(name, { body })`, user JWT)
| Function | Body | 200 response | Errors (`{ error: CODE }`) |
|---|---|---|---|
| `process-report` | `{ report_id }` | `{ summary_id, lab_results_inserted }` | 401, 403 NOT_ON_CARE_TEAM, 404 NOT_FOUND, 429 RATE_LIMITED, 502 AI_FAILED |
| `summarize-consultation` | `{ consultation_id }` | `{ summary_id }` | same |
| `summarize-pregnancy` | `{ pregnancy_id }` | `{ summary_id }` | same |
| `send-push` | `{ notification_id }` (pg_net, service role) | `{ sent }` | internal |
| `admin-users` | `{ action: 'create', email, full_name, role, ...staff fields }` / `update` / `set_role` / `set_active` / `resend_invite` (`user_id`) / `process_deletion` (`request_id`) | `{ user_id, invite_sent }` / `{ ok }` | 401, 403, 400 INVALID_INPUT, 404, 409 EMAIL_TAKEN / INVALID_STATUS_CHANGE |
| `export-patient-data` | `{ patient_id }` or `{ user_id }` | the export JSON (format_version 2) | 401, 403, 400, 404 |
AI provider chosen by env `AI_PROVIDER=mock|gemini` (default `mock`; no real key anywhere); push
provider by `PUSH_PROVIDER=mock|expo` (default `mock`). `send-push` has `verify_jwt = false` and
checks the bearer against `SUPABASE_SERVICE_ROLE_KEY` itself.

## 5b. Admin agent

All admin RPCs raise NOT_AUTHENTICATED / NOT_ALLOWED for non-admins and write an explicit audit
row (with the reason) where a reason is required.

| Function | Notes |
|---|---|
| `admin_dashboard_metrics()`, `admin_data_quality_counts()`, `admin_data_quality_issues(p_rule text default null, p_limit int default 200)` | dashboard numbers and the data-quality rules (soft-deleted patients ignored) |
| `admin_create_patient(p_details jsonb) -> uuid` | verified desk record; optional pregnancy (`lmp_date`) and `primary_doctor` |
| `admin_set_patient_deleted(p_patient uuid, p_deleted boolean, p_reason text default null)` | soft delete (reason >= 3 chars) / restore |
| `admin_hard_delete_patient(p_patient uuid, p_reason text) -> text[]` | **patient must be soft-deleted first (SOFT_DELETE_REQUIRED)**; reason >= 5 chars; cascades; returns the storage paths, which the app removes from bucket `reports` |
| `admin_update_pregnancy_dates(p_pregnancy uuid, p_lmp_date date, p_edd_usg date, p_reason text)` | planned visits shift via the EDD trigger |
| `admin_set_primary_doctor(p_pregnancy, p_doctor)`, `admin_add_backup_doctor(p_pregnancy, p_doctor, p_note default null)`, `admin_remove_care_team_member(p_pregnancy, p_doctor)` | also for pregnancies without a primary |
| `admin_resolve_data_request(p_request uuid, p_status text, p_note text default null)` | `in_progress` / `done` / `rejected`; deletions are completed by `admin-users` `process_deletion` |

Service role only (behind the Edge Functions, which pass the acting admin as `p_actor`; SQL
re-checks it): `admin_staff_apply(p_actor, p_user, p_args jsonb, p_event text default 'staff_update')`
(staff accounts only; the role comes from `app_metadata.role`, copied to the profile by the auth
trigger on `update of raw_app_meta_data`), `admin_deidentify_user(p_actor, p_user, p_request default null)`,
`admin_export_patient_data(p_actor, p_patient default null, p_user default null) -> jsonb`
(**excludes `consultation_private_notes`**, decision 2026-10-23; always writes an `export` audit row).

## 6. Shared data contracts

- **AI summary JSON** (`ai_summaries.draft/final`, `published_summaries.final`): PLAN §9.3, zod
  schema `src/domain/schemas/ai-summary.ts` (`aiSummaryDocumentSchema`, `{ lab_values?, summary }`).
- **Storage**: private bucket `reports`, path `{patient_id}/{pregnancy_id}/{report_id}/{file_id}.{ext}`,
  pdf/jpeg/png/webp, 20 MB. Read via `createSignedUrl(path, 60)`. Policies: backend.
- **Notifications** `data` jsonb: `{ "route": "<app path>" }`. Backend's inbox does
  `router.push(data.route)`. Every owner must implement these routes:

| Event (`type`) | Patient | Companion | Doctor | Admin |
|---|---|---|---|---|
| `appointment_booked/changed/cancelled/reminder` | `/patient/appointments/{appointment_id}` | `/companion/{patient_id}/appointments` | `/doctor/today` | |
| `consultation_published` | `/patient/prescriptions` | `/companion/{patient_id}/prescriptions` | | |
| `summary_published` | `/patient/reports/summaries/{summary_id}` | `/companion/{patient_id}/summaries` | | |
| `report_added` | `/patient/reports/{report_id}` | `/companion/{patient_id}/reports` | | |
| `account_verified`, `visit_due` | `/patient`, `/patient/appointments/book?visit={visit_id}` | | | |
| `companion_request` | `/patient/companions` | | | |
| `companion_approved/revoked` | | `/companion` | | |
| `week_update`, `trimester_change` | `/patient/journey` | `/companion/{patient_id}/journey` | | |
| `ai_draft_ready` | | | `/doctor/ai-inbox/{summary_id}` | |
| `patient_checked_in` | | | `/doctor/today` | |
| `care_team_changed` | | | `/doctor/patient/{pregnancy_id}` | |
| `data_quality` | | | `/doctor/patients` | `/admin/data-quality` |

- **Push text** is non-sensitive ("New update from GARBH: ..."); details only in-app (PLAN §11).
