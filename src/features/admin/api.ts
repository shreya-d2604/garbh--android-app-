// Supabase calls for the admin area. Screens use the hooks in hooks.ts; every function here either
// returns data or throws the Supabase error / FunctionError so adminErrorKey() can describe it.
// No PHI is ever logged.
import { rpcErrorCode } from '@/domain/rpc-errors';
import { supabase } from '@/lib/supabase';
import type { Database, Json } from '@/types/database';

import { AUDIT_PAGE_SIZE, dayRange, type AuditFilters, type AuditRow } from './audit';
import type { ConfigTable, Row } from './config';
import type { DqIssueRow } from './data-quality';
import { searchFilter, type DashboardRow } from './format';
import { STAFF_ROLES, type StaffRole } from './users';

type Tables = Database['public']['Tables'];
export type PatientRow = Tables['patients']['Row'];
export type PregnancyRow = Tables['pregnancies']['Row'];
export type CareTeamRow = Tables['care_team']['Row'];
export type DataRequestRow = Tables['data_requests']['Row'];
export type ProfileRow = Tables['profiles']['Row'];

/** Error carrying the `{ error: CODE }` an Edge Function answered with. */
export class FunctionError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'FunctionError';
  }
}

/** Reads the `{ error }` code out of a failed supabase.functions.invoke() error. */
export async function functionErrorCode(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = (await (context as Response).json()) as { error?: unknown };
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // not JSON: fall through
    }
  }
  return 'GENERIC';
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) throw new FunctionError(await functionErrorCode(error));
  return data as T;
}

type Result<T> = { data: T; error: { message: string; code?: string } | null };

/** Unwraps a Supabase response: throws its error, otherwise returns the (non-null) data. */
function must<T>(result: Result<T>): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

/** Same, for maybeSingle(): "no row" is null, not an error. */
function mustMaybe<T>(result: Result<T>): NonNullable<T> | null {
  if (result.error) throw result.error;
  return (result.data ?? null) as NonNullable<T> | null;
}

// ---------------------------------------------------------------- dashboard + data quality
export async function fetchDashboard(): Promise<DashboardRow> {
  const rows = must(await supabase.rpc('admin_dashboard_metrics'));
  const r = rows[0];
  if (!r) throw new Error('GENERIC');
  return { ...r, no_show_rate: r.no_show_rate == null ? null : Number(r.no_show_rate) };
}

export async function fetchDqCounts() {
  return must(await supabase.rpc('admin_data_quality_counts'));
}

export async function fetchDqIssues(rule: string, limit = 200): Promise<DqIssueRow[]> {
  return must(await supabase.rpc('admin_data_quality_issues', { p_rule: rule, p_limit: limit }));
}

// ---------------------------------------------------------------- profiles / staff
export interface StaffMember {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  is_active: boolean;
  designation: string | null;
  specialization: string | null;
  registration_no: string | null;
  bio: string | null;
}

const STAFF_SELECT =
  'id, full_name, email, phone, role, is_active, staff_details(designation, specialization, registration_no, bio)';

type StaffQueryRow = Pick<ProfileRow, 'id' | 'full_name' | 'email' | 'phone' | 'is_active'> & {
  role: ProfileRow['role'];
  staff_details: {
    designation: string | null;
    specialization: string | null;
    registration_no: string | null;
    bio: string | null;
  } | null;
};

function toStaff(r: StaffQueryRow): StaffMember {
  return {
    id: r.id,
    full_name: r.full_name,
    email: r.email,
    phone: r.phone,
    role: r.role as StaffRole,
    is_active: r.is_active,
    designation: r.staff_details?.designation ?? null,
    specialization: r.staff_details?.specialization ?? null,
    registration_no: r.staff_details?.registration_no ?? null,
    bio: r.staff_details?.bio ?? null,
  };
}

export async function fetchStaff(): Promise<StaffMember[]> {
  const rows = must(
    await supabase
      .from('profiles')
      .select(STAFF_SELECT)
      .in('role', [...STAFF_ROLES])
      .is('deleted_at', null)
      .order('full_name'),
  );
  return (rows as unknown as StaffQueryRow[]).map(toStaff);
}

export async function fetchStaffMember(id: string): Promise<StaffMember | null> {
  const row = mustMaybe(
    await supabase.from('profiles').select(STAFF_SELECT).eq('id', id).maybeSingle(),
  );
  return row ? toStaff(row as unknown as StaffQueryRow) : null;
}

/** Active doctors, for care-team pickers. */
export async function fetchDoctors(): Promise<
  { id: string; full_name: string | null; specialization: string | null }[]
> {
  const rows = must(
    await supabase
      .from('profiles')
      .select('id, full_name, staff_details(specialization)')
      .eq('role', 'doctor')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name'),
  );
  return (
    rows as unknown as {
      id: string;
      full_name: string | null;
      staff_details: { specialization: string | null } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    specialization: r.staff_details?.specialization ?? null,
  }));
}

export interface PersonName {
  id: string;
  full_name: string | null;
  email: string | null;
  role: ProfileRow['role'];
  is_active: boolean;
}

/** id -> profile summary, for tables that only hold user ids (care team, audit log, requests). */
export async function fetchPeople(ids: readonly string[]): Promise<Record<string, PersonName>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const rows = must(
    await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .in('id', unique),
  );
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export const adminUsers = {
  create: (input: Record<string, unknown>) =>
    invoke<{ user_id: string; invite_sent: boolean }>('admin-users', {
      action: 'create',
      ...input,
    }),
  update: (userId: string, fields: Record<string, unknown>) =>
    invoke<{ ok: true }>('admin-users', { action: 'update', user_id: userId, ...fields }),
  setRole: (userId: string, role: StaffRole) =>
    invoke<{ ok: true }>('admin-users', { action: 'set_role', user_id: userId, role }),
  setActive: (userId: string, isActive: boolean) =>
    invoke<{ ok: true }>('admin-users', {
      action: 'set_active',
      user_id: userId,
      is_active: isActive,
    }),
  resendInvite: (userId: string) =>
    invoke<{ invite_sent: boolean }>('admin-users', { action: 'resend_invite', user_id: userId }),
  processDeletion: (requestId: string) =>
    invoke<{ ok: true }>('admin-users', { action: 'process_deletion', request_id: requestId }),
};

export function exportPatientData(subject: { patientId?: string; userId?: string }) {
  return invoke<Record<string, unknown>>('export-patient-data', {
    ...(subject.patientId ? { patient_id: subject.patientId } : {}),
    ...(subject.userId ? { user_id: subject.userId } : {}),
  });
}

// ---------------------------------------------------------------- patients
export interface PatientListItem {
  id: string;
  full_name: string;
  mrn: string | null;
  phone: string | null;
  registration_source: string;
  verified_at: string | null;
  deleted_at: string | null;
  user_id: string | null;
  pregnancies: Pick<PregnancyRow, 'id' | 'status' | 'risk_level' | 'edd_final'>[];
}

export type PatientFilter = 'all' | 'unverified' | 'deleted';

export async function fetchPatients(
  search: string,
  filter: PatientFilter,
): Promise<PatientListItem[]> {
  let q = supabase
    .from('patients')
    .select(
      'id, full_name, mrn, phone, registration_source, verified_at, deleted_at, user_id, pregnancies(id, status, risk_level, edd_final)',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  const or = searchFilter(['full_name', 'mrn', 'phone', 'email'], search);
  if (or) q = q.or(or);
  if (filter === 'unverified') q = q.is('verified_at', null).is('deleted_at', null);
  else if (filter === 'deleted') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);
  return must(await q) as unknown as PatientListItem[];
}

export async function fetchPatient(id: string): Promise<PatientRow | null> {
  return mustMaybe(await supabase.from('patients').select('*').eq('id', id).maybeSingle());
}

export async function fetchPregnancies(patientId: string): Promise<PregnancyRow[]> {
  return must(
    await supabase
      .from('pregnancies')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false }),
  );
}

export async function fetchPregnancy(id: string): Promise<PregnancyRow | null> {
  return mustMaybe(await supabase.from('pregnancies').select('*').eq('id', id).maybeSingle());
}

/** Admin opens a chart: audit-logged like every sensitive view (PLAN.md §0). */
export async function logPatientView(patientId: string, table: string, record?: string) {
  await supabase.rpc('log_sensitive_view', {
    p_patient: patientId,
    p_table: table,
    p_record: record,
  });
}

export async function createPatient(details: Record<string, unknown>): Promise<string> {
  return must(await supabase.rpc('admin_create_patient', { p_details: details as Json }));
}

export async function updatePatient(id: string, values: Tables['patients']['Update']) {
  must(await supabase.from('patients').update(values).eq('id', id).select('id').single());
}

export async function setPatientDeleted(id: string, deleted: boolean, reason?: string) {
  must(
    await supabase.rpc('admin_set_patient_deleted', {
      p_patient: id,
      p_deleted: deleted,
      p_reason: reason,
    }),
  );
}

/**
 * Hard delete: the database removes the rows and answers with the storage paths of her report files,
 * which are then removed from the private bucket (SQL must not delete storage objects itself).
 * Returns how many files could NOT be removed (0 = everything is gone).
 */
export async function hardDeletePatient(id: string, reason: string): Promise<number> {
  const paths = must(
    await supabase.rpc('admin_hard_delete_patient', { p_patient: id, p_reason: reason }),
  );
  if (!paths || paths.length === 0) return 0;
  const { error } = await supabase.storage.from('reports').remove(paths);
  return error ? paths.length : 0;
}

export async function mergePatients(sourceId: string, targetId: string) {
  must(await supabase.rpc('merge_patients', { p_source: sourceId, p_target: targetId }));
}

export async function createPregnancy(patientId: string, lmpDate: string) {
  must(
    await supabase
      .from('pregnancies')
      .insert({ patient_id: patientId, lmp_date: lmpDate, lmp_source: 'clinician' })
      .select('id')
      .single(),
  );
}

export async function updatePregnancyDates(
  id: string,
  lmp: string | null,
  eddUsg: string | null,
  reason: string,
) {
  must(
    await supabase.rpc('admin_update_pregnancy_dates', {
      p_pregnancy: id,
      p_lmp_date: lmp as string,
      p_edd_usg: eddUsg as string,
      p_reason: reason,
    }),
  );
}

export async function updatePregnancyStatus(id: string, values: Tables['pregnancies']['Update']) {
  must(await supabase.from('pregnancies').update(values).eq('id', id).select('id').single());
}

// ---------------------------------------------------------------- care team
export interface CareMember extends CareTeamRow {
  doctor: PersonName | null;
}

export async function fetchCareTeam(pregnancyId: string): Promise<CareMember[]> {
  const rows = must(
    await supabase
      .from('care_team')
      .select('*')
      .eq('pregnancy_id', pregnancyId)
      .is('removed_at', null)
      .order('care_role'),
  );
  const people = await fetchPeople(rows.map((r) => r.doctor_id));
  return rows.map((r) => ({ ...r, doctor: people[r.doctor_id] ?? null }));
}

export const careTeam = {
  setPrimary: async (pregnancyId: string, doctorId: string) =>
    must(
      await supabase.rpc('admin_set_primary_doctor', {
        p_pregnancy: pregnancyId,
        p_doctor: doctorId,
      }),
    ),
  addBackup: async (pregnancyId: string, doctorId: string, note?: string) =>
    must(
      await supabase.rpc('admin_add_backup_doctor', {
        p_pregnancy: pregnancyId,
        p_doctor: doctorId,
        p_note: note,
      }),
    ),
  remove: async (pregnancyId: string, doctorId: string) =>
    must(
      await supabase.rpc('admin_remove_care_team_member', {
        p_pregnancy: pregnancyId,
        p_doctor: doctorId,
      }),
    ),
};

// ---------------------------------------------------------------- data-quality item fixes
export async function fetchAppointment(id: string) {
  return mustMaybe(await supabase.from('appointments').select('*').eq('id', id).maybeSingle());
}

/** Closes an appointment that was left open. Admin may set any status (appointments_admin_all). */
export async function closeAppointment(id: string, status: 'no_show' | 'completed' | 'cancelled') {
  must(
    await supabase
      .from('appointments')
      .update(
        status === 'cancelled'
          ? { status, cancelled_reason: 'Closed by admin (data quality)' }
          : { status },
      )
      .eq('id', id)
      .select('id')
      .single(),
  );
}

export async function fetchConsultation(id: string) {
  return mustMaybe(await supabase.from('consultations').select('*').eq('id', id).maybeSingle());
}

export async function updateConsultation(id: string, values: Tables['consultations']['Update']) {
  must(await supabase.from('consultations').update(values).eq('id', id).select('id').single());
}

export async function fetchLabResult(id: string) {
  return mustMaybe(await supabase.from('lab_results').select('*').eq('id', id).maybeSingle());
}

export async function updateLabValue(id: string, valueNum: number | null) {
  must(
    await supabase
      .from('lab_results')
      .update({ value_num: valueNum })
      .eq('id', id)
      .select('id')
      .single(),
  );
}

export async function fetchReportValues(reportId: string) {
  const report = mustMaybe(
    await supabase
      .from('reports')
      .select('id, pregnancy_id, type, title, report_date, extraction_status')
      .eq('id', reportId)
      .maybeSingle(),
  );
  const values = must(
    await supabase
      .from('lab_results')
      .select('id, test_code, raw_name, value_num, value_text, unit, verified, created_at')
      .eq('report_id', reportId)
      .order('created_at'),
  );
  return { report, values };
}

export async function fetchAiSummary(id: string) {
  return mustMaybe(
    await supabase
      .from('ai_summaries')
      .select('id, pregnancy_id, source_type, status, generated_at, model')
      .eq('id', id)
      .maybeSingle(),
  );
}

export async function fetchPregnancyOwner(pregnancyId: string) {
  return mustMaybe(
    await supabase.from('pregnancies').select('id, patient_id').eq('id', pregnancyId).maybeSingle(),
  );
}

// ---------------------------------------------------------------- configuration
type AnyTable = ReturnType<typeof supabase.from>;
const table = (name: string) => supabase.from(name as never) as unknown as AnyTable;

export async function fetchConfigRows(def: ConfigTable): Promise<Row[]> {
  let q = table(def.table).select('*');
  for (const col of def.orderBy) q = q.order(col, { ascending: true, nullsFirst: true });
  return must(await q) as unknown as Row[];
}

export async function fetchConfigRow(def: ConfigTable, id: string): Promise<Row | null> {
  return mustMaybe(
    await table(def.table).select('*').eq(def.pk, id).maybeSingle(),
  ) as unknown as Row | null;
}

export async function saveConfigRow(def: ConfigTable, id: string | null, payload: Row) {
  const t = table(def.table);
  if (id)
    must(
      await t
        .update(payload as never)
        .eq(def.pk, id)
        .select()
        .single(),
    );
  else
    must(
      await t
        .insert(payload as never)
        .select()
        .single(),
    );
}

export async function deleteConfigRow(def: ConfigTable, id: string) {
  must(await table(def.table).delete().eq(def.pk, id).select().single());
}

export async function fetchHospitalSettings(): Promise<Row> {
  return must(
    await supabase.from('hospital_settings').select('*').eq('id', 1).single(),
  ) as unknown as Row;
}

export async function saveHospitalSettings(payload: Row) {
  must(
    await supabase
      .from('hospital_settings')
      .update(payload as Tables['hospital_settings']['Update'])
      .eq('id', 1)
      .select('id')
      .single(),
  );
}

// ---------------------------------------------------------------- audit log
export async function fetchAuditPage(filters: AuditFilters, page: number): Promise<AuditRow[]> {
  let q = supabase
    .from('audit_log')
    .select('*')
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * AUDIT_PAGE_SIZE, (page + 1) * AUDIT_PAGE_SIZE - 1);
  if (filters.actorId) q = q.eq('actor_id', filters.actorId);
  if (filters.patientId) q = q.eq('patient_id', filters.patientId);
  if (filters.table) q = q.eq('table_name', filters.table);
  if (filters.action) q = q.eq('action', filters.action);
  const { gte, lt } = dayRange(filters.from, filters.to);
  if (gte) q = q.gte('at', gte);
  if (lt) q = q.lt('at', lt);
  return must(await q) as unknown as AuditRow[];
}

/** Staff / app users to pick in the audit filter, by name or email. */
export async function searchPeople(term: string) {
  const or = searchFilter(['full_name', 'email'], term);
  if (!or) return [];
  return must(
    await supabase.from('profiles').select('id, full_name, email, role').or(or).limit(10),
  );
}

/** Patients to pick in the audit filter, by name or MRN. */
export async function searchPatients(term: string) {
  const or = searchFilter(['full_name', 'mrn'], term);
  if (!or) return [];
  return must(await supabase.from('patients').select('id, full_name, mrn').or(or).limit(10));
}

// ---------------------------------------------------------------- data requests (DPDP)
export interface RequestItem extends DataRequestRow {
  requester: PersonName | null;
}

export type RequestFilter = 'open' | 'closed';

export async function fetchRequests(filter: RequestFilter): Promise<RequestItem[]> {
  let q = supabase
    .from('data_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  q =
    filter === 'open'
      ? q.in('status', ['open', 'in_progress'])
      : q.in('status', ['done', 'rejected']);
  const rows = must(await q);
  const people = await fetchPeople(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, requester: people[r.user_id] ?? null }));
}

export async function resolveRequest(
  id: string,
  status: 'in_progress' | 'done' | 'rejected',
  note?: string,
) {
  must(
    await supabase.rpc('admin_resolve_data_request', {
      p_request: id,
      p_status: status,
      p_note: note,
    }),
  );
}

// ---------------------------------------------------------------- own profile + own requests (every role)
export async function updateOwnProfile(
  userId: string,
  values: { full_name: string; phone: string | null },
) {
  must(await supabase.from('profiles').update(values).eq('id', userId).select('id').single());
}

export async function fetchOwnRequests(userId: string): Promise<DataRequestRow[]> {
  return must(
    await supabase
      .from('data_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  );
}

export async function createOwnRequest(userId: string, kind: 'deletion' | 'export') {
  must(
    await supabase.from('data_requests').insert({ user_id: userId, kind }).select('id').single(),
  );
}

/** True when an RPC error is the known "not built yet" stub (used to word the message). */
export function isNotImplemented(error: unknown): boolean {
  return rpcErrorCode(error as { message?: string }) === 'NOT_IMPLEMENTED';
}
