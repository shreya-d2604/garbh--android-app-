// Audit log viewer helpers (PLAN.md §7.6 #6): filters, date ranges and "what changed".
import { addDays, isISODate, type ISODate } from '@/domain/pregnancy-math';

export const AUDIT_PAGE_SIZE = 40;
export const AUDIT_ACTIONS = ['insert', 'update', 'delete', 'view_sensitive', 'export'] as const;
export const AUDIT_TABLES = [
  'patients',
  'pregnancies',
  'care_team',
  'visits',
  'appointments',
  'consultations',
  'consultation_private_notes',
  'prescription_items',
  'reports',
  'report_files',
  'lab_results',
  'ai_summaries',
  'companion_links',
  'profiles',
  'staff_details',
  'data_requests',
  'hospital_settings',
  'visit_templates',
  'lab_tests',
  'drug_catalog',
  'curated_guidance',
  'week_content',
  'milestones',
] as const;

export interface AuditFilters {
  actorId?: string;
  patientId?: string;
  table?: string;
  action?: string;
  from?: ISODate;
  to?: ISODate;
}

export interface AuditRow {
  id: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  patient_id: string | null;
  old: unknown;
  new: unknown;
  at: string;
}

function localMidnight(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Inclusive calendar-day range -> timestamptz bounds (device timezone): at >= gte and at < lt. */
export function dayRange(from?: string, to?: string): { gte?: string; lt?: string } {
  const out: { gte?: string; lt?: string } = {};
  if (from && isISODate(from)) out.gte = localMidnight(from).toISOString();
  if (to && isISODate(to)) out.lt = localMidnight(addDays(to, 1)).toISOString();
  return out;
}

export function hasFilters(f: AuditFilters): boolean {
  return Object.values(f).some((v) => !!v);
}

export interface FieldChange {
  key: string;
  before: unknown;
  after: unknown;
}

const NOISE = new Set(['updated_at']);

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** For an update: the columns that differ. For insert / delete: the filled columns. */
export function changedFields(row: Pick<AuditRow, 'action' | 'old' | 'new'>): FieldChange[] {
  const before = asObject(row.old);
  const after = asObject(row.new);
  if (row.action === 'update' && before && after) {
    return Object.keys({ ...before, ...after })
      .filter((k) => !NOISE.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((key) => ({ key, before: before[key], after: after[key] }));
  }
  if (row.action === 'insert' && after) {
    return Object.keys(after)
      .filter((k) => !NOISE.has(k) && after[k] !== null)
      .map((key) => ({ key, before: undefined, after: after[key] }));
  }
  if (row.action === 'delete' && before) {
    return Object.keys(before)
      .filter((k) => !NOISE.has(k) && before[k] !== null)
      .map((key) => ({ key, before: before[key], after: undefined }));
  }
  return [];
}

/** The explicit "event" an admin RPC logged (soft_delete, hard_delete, fix_dates, ...) and its reason. */
export function explicitEvent(
  row: Pick<AuditRow, 'new'>,
): { event: string; reason: string | null } | null {
  const n = asObject(row.new);
  if (!n || typeof n.event !== 'string') return null;
  return { event: n.event, reason: typeof n.reason === 'string' ? n.reason : null };
}

/** Short display text for a changed value. */
export function formatValue(v: unknown, max = 80): string {
  if (v === undefined || v === null) return '-';
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
