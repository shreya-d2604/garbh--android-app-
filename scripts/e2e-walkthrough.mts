// End-to-end role walkthrough against the LOCAL Supabase stack (REST, RPC, Storage, Edge
// Functions, real email OTP through Mailpit). Synthetic data only.
//
//   npm run db:check && bash scripts/seed-demo-files.sh   # fresh database
//   node scripts/e2e-walkthrough.mts
//
// Needs: the local stack running (`npx supabase start` also serves the Edge Functions with the
// mock AI and mock push providers) and psql on PATH (to put the push key into Vault).
// Exits non-zero when any check fails. Each run creates new users (timestamped emails).
import { execSync } from 'node:child_process';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------ setup
const env = Object.fromEntries(
  execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [m[1], m[2]]),
) as Record<string, string>;
const URL = env.API_URL ?? 'http://127.0.0.1:54321';
const ANON = env.ANON_KEY!;
const SERVICE = env.SERVICE_ROLE_KEY!;
const DB = env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const MAILPIT = env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

const ASHA = '00000000-0000-4000-a000-000000000002'; // doctor, accepts new patients
const MEERA = '00000000-0000-4000-a000-000000000003'; // doctor, not on the new patient's team
const TS = Date.now();
const out = (s: string) => process.stdout.write(s + '\n');

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    out(`  ok   ${name}`);
  } else {
    failures.push(name);
    out(`  FAIL ${name}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
  }
}
function section(title: string) {
  out(`\n## ${title}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function must<T>(res: { data: T; error: unknown }, what: string): T {
  if (res.error) throw new Error(`${what}: ${JSON.stringify(res.error)}`);
  return res.data;
}
async function count(q: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<number> {
  const r = await q;
  if (r.error) throw new Error(JSON.stringify(r.error));
  return r.data?.length ?? 0;
}
const errMessage = (e: unknown) => (e as { message?: string } | null)?.message ?? null;

const service = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Real sign-in: email OTP, code read from Mailpit. */
async function signIn(email: string): Promise<{ c: SupabaseClient; uid: string }> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = Date.now() - 1000;
  must(await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }), `otp ${email}`);
  let code: string | null = null;
  for (let i = 0; i < 40 && !code; i++) {
    await sleep(250);
    const list = (await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
    ).json()) as { messages?: { ID: string; Created: string }[] };
    const latest = (list.messages ?? []).find((m) => Date.parse(m.Created) >= since);
    if (!latest) continue;
    const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)).json()) as {
      Text?: string;
      HTML?: string;
    };
    code = /\b(\d{6})\b/.exec(`${msg.Text ?? ''} ${msg.HTML ?? ''}`)?.[1] ?? null;
  }
  if (!code) throw new Error(`no OTP email for ${email}`);
  const s = must(await c.auth.verifyOtp({ email, token: code, type: 'email' }), `verify ${email}`);
  return { c, uid: s.user!.id };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const daysFromNow = (n: number) => isoDay(new Date(Date.now() + n * 86_400_000));

// Vault secret for pg_net -> send-push (lost on every db reset).
execSync(
  `psql "${DB}" -qAtc "delete from vault.secrets where name = 'push_service_key'; select vault.create_secret('${SERVICE}', 'push_service_key');"`,
  { stdio: 'ignore' },
);

// ------------------------------------------------------------------ 1. self-registration
section('1. Patient self-registers (email OTP, consent, onboarding)');
const patEmail = `e2e.patient.${TS}@garbh.test`;
const { c: pat, uid: patUid } = await signIn(patEmail);
must(await pat.rpc('record_consent'), 'record_consent');
must(
  await pat.rpc('complete_signup', {
    p_kind: 'patient',
    p_details: {
      full_name: 'E2E Synthetic Patient',
      phone: '+919811100001',
      dob: '1995-05-05',
      lmp_date: daysFromNow(-84),
    },
  }),
  'complete_signup',
);
const me = must(await pat.from('profiles').select('role').eq('id', patUid).single(), 'profile');
check('new user is a patient after onboarding', me.role === 'patient', me);
const patient = must(await pat.from('patients').select('id, is_verified').single(), 'patient row');
check('self-registered patient is unverified', patient.is_verified === false, patient);
const preg = must(
  await pat.from('pregnancies').select('id').eq('status', 'active').single(),
  'pregnancy',
);
const visits = must(
  await pat.from('visits').select('id, seq').eq('pregnancy_id', preg.id).order('seq'),
  'visits',
);
check('visit plan generated for the new pregnancy', visits.length > 0, visits.length);
must(
  await pat.rpc('register_push_token', {
    p_token: `ExponentPushToken[e2e-${TS}]`,
    p_platform: 'android',
  }),
  'push token',
);

// ------------------------------------------------------------------ 2. online booking
section('2. Patient books her first visit online');
const slots = must(
  await pat.rpc('available_slots', {
    p_doctor: ASHA,
    p_from: daysFromNow(0),
    p_to: daysFromNow(20),
  }),
  'available_slots',
) as { starts_at: string; ends_at: string }[];
check('free slots are offered for a doctor taking new patients', slots.length > 1, slots.length);
const apptId = must(
  await pat.rpc('book_appointment', { p_doctor: ASHA, p_starts_at: slots[0]!.starts_at }),
  'book',
) as string;
check('booking returns an appointment id', typeof apptId === 'string');
const team = must(
  await pat.from('care_team').select('doctor_id, care_role').eq('pregnancy_id', preg.id),
  'team',
);
check(
  'first booking makes the doctor her primary',
  team.some((t) => t.doctor_id === ASHA && t.care_role === 'primary'),
  team,
);
const second = await pat.rpc('book_appointment', {
  p_doctor: ASHA,
  p_starts_at: slots[1]!.starts_at,
});
check(
  'an unverified patient cannot hold a second upcoming booking',
  errMessage(second.error) === 'MAX_UPCOMING',
  second.error,
);

// ------------------------------------------------------------------ 3. reception
section('3. Reception sees the booking, logs a call, verifies the patient');
const { c: rec } = await signIn('reception@garbh.test');
const recAppt = must(
  await rec.from('appointments').select('id, booking_channel, status').eq('id', apptId),
  'rec appt',
);
check(
  'reception sees the app booking',
  recAppt.length === 1 && recAppt[0]!.booking_channel === 'app',
  recAppt,
);
const due = await rec
  .from('visits')
  .select(
    'id, visit_contacts(contacted_at, contact_note), pregnancies!inner(status, patients!inner(id, full_name))',
  )
  .eq('pregnancy_id', preg.id);
check('reception visits-due query (with the call-note embed) works', !due.error, due.error);
must(
  await rec.rpc('mark_visit_contacted', {
    p_visit: visits[visits.length - 1]!.id,
    p_note: 'Called (e2e)',
  }),
  'contacted',
);
check(
  'the patient cannot read the reception call note',
  (await count(pat.from('visit_contacts').select('visit_id'))) === 0,
);
const noCol = await pat.from('visits').select('contact_note').limit(1);
check('visits no longer exposes a contact_note column', noCol.error !== null);
must(await rec.rpc('verify_patient', { p_patient: patient.id, p_mrn: `E2E-${TS}` }), 'verify');
const verified = must(await pat.from('patients').select('is_verified').single(), 'verified');
check('patient is verified', verified.is_verified === true);
check(
  'patient got the account_verified notification',
  (await count(pat.from('notifications').select('id').eq('type', 'account_verified'))) === 1,
);

// ------------------------------------------------------------------ 4. care team visibility
section('4. Care-team doctor sees the chart; an off-team doctor sees nothing');
const { c: asha } = await signIn('dr.asha@garbh.test');
const { c: meera } = await signIn('dr.meera@garbh.test');
check(
  'primary doctor reads the patient',
  (await count(asha.from('patients').select('id').eq('id', patient.id))) === 1,
);
check(
  'primary doctor reads the pregnancy and appointment',
  (await count(asha.from('pregnancies').select('id').eq('id', preg.id))) === 1 &&
    (await count(asha.from('appointments').select('id').eq('id', apptId))) === 1,
);
must(
  await asha.rpc('log_sensitive_view', { p_patient: patient.id, p_table: 'patients' }),
  'audit view',
);
for (const [tbl, col, val] of [
  ['patients', 'id', patient.id],
  ['pregnancies', 'id', preg.id],
  ['appointments', 'id', apptId],
  ['visits', 'pregnancy_id', preg.id],
] as const) {
  check(
    `off-team doctor sees zero ${tbl}`,
    (await count(meera.from(tbl).select('id').eq(col, val))) === 0,
  );
}

// ------------------------------------------------------------------ 5. backup added, then leaves
section('5. Primary adds a backup; the backup leaves on her own');
must(
  await asha.rpc('add_backup_doctor', {
    p_pregnancy: preg.id,
    p_doctor: MEERA,
    p_note: 'e2e cover',
  }),
  'add backup',
);
check(
  'backup now reads the chart',
  (await count(meera.from('patients').select('id').eq('id', patient.id))) === 1,
);
must(
  await meera.rpc('remove_care_team_member', { p_pregnancy: preg.id, p_doctor: MEERA }),
  'leave',
);
check(
  'after leaving, the backup sees nothing',
  (await count(meera.from('patients').select('id').eq('id', patient.id))) === 0,
);
check(
  'primary is told the backup left',
  (await count(
    asha
      .from('notifications')
      .select('id')
      .eq('type', 'care_team_changed')
      .contains('data', { pregnancy_id: preg.id }),
  )) >= 1,
);
const primaryLeave = await asha.rpc('remove_care_team_member', {
  p_pregnancy: preg.id,
  p_doctor: ASHA,
});
check(
  'the primary cannot leave without handing over',
  errMessage(primaryLeave.error) === 'INVALID_INPUT',
  primaryLeave.error,
);

// ------------------------------------------------------------------ 6. report -> AI draft -> approval
section('6. Doctor uploads a report -> mock AI draft -> doctor approves -> patient sees it');
const report = must(
  await asha
    .from('reports')
    .insert({
      pregnancy_id: preg.id,
      type: 'blood',
      title: 'E2E CBC (synthetic)',
      report_date: isoDay(today),
      uploaded_by: ASHA,
    })
    .select('id')
    .single(),
  'report insert',
);
const fileId = crypto.randomUUID();
const path = `${patient.id}/${preg.id}/${report.id}/${fileId}.pdf`;
const pdf = new TextEncoder().encode('%PDF-1.4\n% synthetic e2e file, no patient data\n%%EOF\n');
must(
  await asha.storage.from('reports').upload(path, pdf, { contentType: 'application/pdf' }),
  'upload',
);
must(
  await asha
    .from('report_files')
    .insert({
      id: fileId,
      report_id: report.id,
      storage_path: path,
      mime_type: 'application/pdf',
      size_bytes: pdf.length,
    }),
  'report_files',
);
check(
  'patient is told a report was added',
  (await count(pat.from('notifications').select('id').eq('type', 'report_added'))) === 1,
);
const offTeamAi = await meera.functions.invoke('process-report', {
  body: { report_id: report.id },
});
check('an off-team doctor cannot run the AI on the report', offTeamAi.error !== null);
const ai = await asha.functions.invoke('process-report', { body: { report_id: report.id } });
check(
  'process-report returns a draft summary',
  !ai.error && typeof ai.data?.summary_id === 'string',
  ai.error ?? ai.data,
);
const summaryId = ai.data?.summary_id as string;
const draft = must(
  await asha.from('ai_summaries').select('status').eq('id', summaryId).single(),
  'draft',
);
check('the AI output is a draft', draft.status === 'draft', draft);
check(
  'patient does not see the draft',
  (await count(pat.from('published_summaries').select('id').eq('id', summaryId))) === 0,
);
check(
  'patient never reads ai_summaries',
  (await count(pat.from('ai_summaries').select('id'))) === 0,
);
const { c: admin } = await signIn('admin@garbh.test');
const adminPublish = await admin.rpc('review_ai_summary', {
  p_summary: summaryId,
  p_action: 'approve_publish',
});
check(
  'admin cannot publish an AI summary',
  errMessage(adminPublish.error) === 'NOT_ALLOWED',
  adminPublish.error,
);
must(
  await asha.rpc('review_ai_summary', { p_summary: summaryId, p_action: 'approve_publish' }),
  'approve',
);
const pub = must(
  await pat.from('published_summaries').select('id, final').eq('id', summaryId),
  'published',
);
check('after approval the patient sees the summary', pub.length === 1);
check(
  'doctor-only flags are stripped from what the patient sees',
  pub.length === 1 && !JSON.stringify(pub[0]!.final).includes('doctor_attention_flags'),
);
check(
  'patient is told a summary was published',
  (await count(pat.from('notifications').select('id').eq('type', 'summary_published'))) === 1,
);
const signed = await pat.storage.from('reports').createSignedUrl(path, 60);
check(
  'patient can open her report file (signed URL)',
  !signed.error && !!signed.data?.signedUrl,
  signed.error,
);
const meeraFile = await meera.storage.from('reports').createSignedUrl(path, 60);
check('off-team doctor cannot open the file', meeraFile.error !== null);

// ------------------------------------------------------------------ 7. companion
section('7. Companion redeems a code -> patient approves -> limited view');
const compEmail = `e2e.companion.${TS}@garbh.test`;
const { c: comp } = await signIn(compEmail);
must(await comp.rpc('record_consent'), 'consent');
must(
  await comp.rpc('complete_signup', {
    p_kind: 'companion',
    p_details: { full_name: 'E2E Synthetic Companion' },
  }),
  'companion signup',
);
const code = must(await pat.rpc('create_companion_invite'), 'invite') as string;
check('invite code is XXX-XXX', /^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(code), code);
const wrong = await comp.rpc('redeem_companion_code', { p_code: 'AAA-AAA', p_relation: 'husband' });
check(
  'a wrong code returns null (no error, attempt counted)',
  !wrong.error && wrong.data === null,
  wrong,
);
const linkId = must(
  await comp.rpc('redeem_companion_code', { p_code: code.toLowerCase(), p_relation: 'husband' }),
  'redeem',
) as string;
check('the right code creates a pending link', typeof linkId === 'string');
check(
  'companion sees nothing while pending',
  (await count(comp.from('appointments').select('id'))) === 0,
);
check(
  'patient got the companion request',
  (await count(pat.from('notifications').select('id').eq('type', 'companion_request'))) === 1,
);
must(
  await pat.rpc('decide_companion_link', {
    p_link: linkId,
    p_approve: true,
    p_perms: { appointments: true, notifications: true },
  }),
  'approve link',
);
check(
  'approved companion sees the appointment',
  (await count(comp.from('appointments').select('id').eq('patient_id', patient.id))) === 1,
);
check(
  'but not summaries (no permission)',
  (await count(comp.from('published_summaries').select('id'))) === 0,
);
check(
  'nor reports or consultations',
  (await count(comp.from('reports').select('id'))) === 0 &&
    (await count(comp.from('consultations').select('id'))) === 0,
);

// ------------------------------------------------------------------ 8. doctor time off clashes
section('8. Doctor time off over the booking: patient + companion told; reception worklist agrees');
const appt = must(
  await asha.from('appointments').select('starts_at, ends_at').eq('id', apptId).single(),
  'appt',
);
const off = must(
  await asha
    .from('doctor_time_off')
    .insert({
      doctor_id: ASHA,
      starts_at: appt.starts_at,
      ends_at: appt.ends_at,
      reason: 'e2e leave',
    })
    .select('id')
    .single(),
  'time off',
);
check(
  'patient is asked to rebook',
  (await count(
    pat
      .from('notifications')
      .select('id')
      .eq('type', 'appointment_changed')
      .contains('data', { time_off_id: off.id }),
  )) === 1,
);
check(
  'approved companion (appointments + notifications) is told too',
  (await count(
    comp
      .from('notifications')
      .select('id')
      .eq('type', 'appointment_changed')
      .contains('data', { time_off_id: off.id }),
  )) === 1,
);
const clash = must(
  await rec
    .from('appointments')
    .select('id')
    .eq('doctor_id', ASHA)
    .in('status', ['booked', 'confirmed'])
    .lt('starts_at', appt.ends_at)
    .gt('ends_at', appt.starts_at),
  'worklist',
);
check(
  "reception's doctor-unavailable worklist lists the same appointment",
  clash.some((a) => a.id === apptId),
  clash,
);

// ------------------------------------------------------------------ 9. revoke
section('9. Patient revokes the companion');
must(await pat.rpc('end_companion_link', { p_link: linkId }), 'revoke');
check(
  'revoked companion sees nothing',
  (await count(comp.from('appointments').select('id'))) === 0 &&
    (await count(comp.from('patients').select('id'))) === 0,
);

// ------------------------------------------------------------------ 10. push via pg_net
section('10. Push: notification -> pg_net -> send-push (mock provider)');
let pushed = 0;
for (let i = 0; i < 20 && pushed === 0; i++) {
  await sleep(500);
  pushed = await count(
    service
      .from('notifications')
      .select('id')
      .eq('user_id', patUid)
      .not('push_sent_at', 'is', null),
  );
}
check("at least one of the patient's notifications was pushed", pushed > 0, pushed);

// ------------------------------------------------------------------ 11. admin
section('11. Admin: staff account, DPDP export, soft then hard delete');
const staff = await admin.functions.invoke('admin-users', {
  body: {
    action: 'create',
    email: `e2e.staff.${TS}@garbh.test`,
    full_name: 'Dr E2E Synthetic',
    role: 'doctor',
  },
});
check(
  'admin-users creates a staff account',
  !staff.error && typeof staff.data?.user_id === 'string',
  staff.error ?? staff.data,
);
if (staff.data?.user_id) {
  const prof = must(
    await admin.from('profiles').select('role').eq('id', staff.data.user_id).single(),
    'staff profile',
  );
  check('the new staff profile has its role (app_metadata trigger)', prof.role === 'doctor', prof);
}
const exp = await admin.functions.invoke('export-patient-data', {
  body: { patient_id: patient.id },
});
check('DPDP export works', !exp.error && Array.isArray(exp.data?.consultations), exp.error);
check(
  'export excludes doctor private notes',
  exp.data && !('consultation_private_notes' in exp.data),
);
check(
  'export is audit-logged',
  (await count(
    admin.from('audit_log').select('id').eq('action', 'export').eq('patient_id', patient.id),
  )) >= 1,
);
const early = await admin.rpc('admin_hard_delete_patient', {
  p_patient: patient.id,
  p_reason: 'E2E cleanup test',
});
check(
  'hard delete is refused before a soft delete',
  errMessage(early.error) === 'SOFT_DELETE_REQUIRED',
  early.error,
);
must(
  await admin.rpc('admin_set_patient_deleted', {
    p_patient: patient.id,
    p_deleted: true,
    p_reason: 'E2E cleanup',
  }),
  'soft delete',
);
const paths = must(
  await admin.rpc('admin_hard_delete_patient', {
    p_patient: patient.id,
    p_reason: 'E2E cleanup test',
  }),
  'hard delete',
) as string[];
check('hard delete returns the report file paths', paths.includes(path), paths);
const removed = await admin.storage.from('reports').remove(paths);
check(
  'admin removes the files from storage',
  !removed.error && (removed.data?.length ?? 0) === paths.length,
  removed.error,
);
const left = await service.storage.from('reports').list(`${patient.id}/${preg.id}/${report.id}`);
check('no file is left in the bucket', (left.data ?? []).length === 0, left.data);

// ------------------------------------------------------------------ summary
out(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  out(`failed: ${failures.join('; ')}`);
  process.exit(1);
}
