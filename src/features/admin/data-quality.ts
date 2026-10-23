// Data-quality center (PLAN.md §7.6 #4): rule metadata, the screen each issue links to, and the
// values interpolated into each rule's message. The rules themselves live in SQL
// (private.dq_issues, migration 20261027000100); keep DQ_RULES in step with it.
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export const DQ_RULES = [
  'no_edd',
  'ga_over_42',
  'no_primary',
  'primary_inactive',
  't3_no_backup',
  'unverified_14d',
  'past_booked',
  'consult_unpublished',
  'lab_unverified_48h',
  'ai_draft_24h',
  'no_app_account',
  'implausible_values',
] as const;
export type DqRule = (typeof DQ_RULES)[number];
export type DqSeverity = 'high' | 'medium' | 'low';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const DQ_ICON: Record<DqRule, IconName> = {
  no_edd: 'calendar-remove-outline',
  ga_over_42: 'calendar-alert',
  no_primary: 'doctor',
  primary_inactive: 'account-off-outline',
  t3_no_backup: 'account-multiple-plus-outline',
  unverified_14d: 'account-clock-outline',
  past_booked: 'calendar-clock-outline',
  consult_unpublished: 'file-document-edit-outline',
  lab_unverified_48h: 'flask-outline',
  ai_draft_24h: 'robot-outline',
  no_app_account: 'cellphone-off',
  implausible_values: 'chart-line-variant',
};

const SEVERITY_ORDER: Record<DqSeverity, number> = { high: 0, medium: 1, low: 2 };

export function isDqRule(value: string | null | undefined): value is DqRule {
  return !!value && (DQ_RULES as readonly string[]).includes(value);
}

export function asSeverity(value: string | null | undefined): DqSeverity {
  return value === 'high' || value === 'low' ? value : 'medium';
}

export interface DqIssue {
  rule: DqRule;
  severity: DqSeverity;
  patientId: string | null;
  pregnancyId: string | null;
  entityId: string | null;
  patientName: string;
  detail: Record<string, unknown>;
  since: string | null;
}

export interface DqIssueRow {
  rule: string;
  severity: string;
  patient_id: string | null;
  pregnancy_id: string | null;
  entity_id: string | null;
  patient_name: string | null;
  detail: unknown;
  since: string | null;
}

/** Row of admin_data_quality_issues() -> DqIssue (unknown rules from a newer server are dropped). */
export function toIssue(row: DqIssueRow): DqIssue | null {
  if (!isDqRule(row.rule)) return null;
  const detail =
    row.detail && typeof row.detail === 'object' && !Array.isArray(row.detail)
      ? (row.detail as Record<string, unknown>)
      : {};
  return {
    rule: row.rule,
    severity: asSeverity(row.severity),
    patientId: row.patient_id,
    pregnancyId: row.pregnancy_id,
    entityId: row.entity_id,
    patientName: row.patient_name ?? '',
    detail,
    since: row.since,
  };
}

export interface DqCount {
  rule: DqRule;
  severity: DqSeverity;
  count: number;
}

const DEFAULT_SEVERITY: Record<DqRule, DqSeverity> = {
  no_edd: 'high',
  ga_over_42: 'high',
  no_primary: 'high',
  primary_inactive: 'high',
  t3_no_backup: 'medium',
  unverified_14d: 'medium',
  past_booked: 'medium',
  consult_unpublished: 'medium',
  lab_unverified_48h: 'medium',
  ai_draft_24h: 'medium',
  no_app_account: 'low',
  implausible_values: 'high',
};

/** All rules (including those with no problems, count 0), problems first, high severity first. */
export function mergeCounts(
  rows: readonly { rule: string; severity: string; issue_count: number }[],
): DqCount[] {
  const byRule = new Map<string, { severity: string; count: number }>();
  for (const r of rows) byRule.set(r.rule, { severity: r.severity, count: Number(r.issue_count) });
  return DQ_RULES.map((rule) => {
    const hit = byRule.get(rule);
    return {
      rule,
      severity: hit ? asSeverity(hit.severity) : DEFAULT_SEVERITY[rule],
      count: hit?.count ?? 0,
    };
  }).sort(
    (a, b) =>
      Number(b.count > 0) - Number(a.count > 0) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.count - a.count,
  );
}

/** Where tapping an issue goes: the screen on which it can be fixed. */
export function dqFixRoute(
  issue: Pick<DqIssue, 'rule' | 'patientId' | 'pregnancyId' | 'entityId'>,
): string {
  const patient = issue.patientId ? `/admin/patients/${issue.patientId}` : '/admin/patients';
  const pregnancy =
    issue.patientId && issue.pregnancyId ? `${patient}/pregnancy/${issue.pregnancyId}` : patient;
  switch (issue.rule) {
    case 'no_edd':
    case 'ga_over_42':
      return pregnancy;
    case 'no_primary':
    case 'primary_inactive':
    case 't3_no_backup':
      return issue.patientId && issue.pregnancyId ? `${pregnancy}/care-team` : patient;
    case 'unverified_14d':
    case 'no_app_account':
      return patient;
    case 'past_booked':
    case 'consult_unpublished':
    case 'ai_draft_24h':
    case 'implausible_values':
    case 'lab_unverified_48h':
      // lab values entered outside a report have no report id: fall back to the pregnancy
      return issue.entityId
        ? `/admin/data-quality/item/${issue.rule}/${issue.entityId}`
        : pregnancy;
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

/** Values for the rule's message in admin.json (dq.rules.<rule>.detail). */
export function dqDetailParams(
  issue: Pick<DqIssue, 'rule' | 'detail'>,
): Record<string, string | number> {
  const d = issue.detail;
  switch (issue.rule) {
    case 'ga_over_42':
      return { weeks: num(d.weeks) ?? 0, days: num(d.days) ?? 0 };
    case 't3_no_backup':
      return { weeks: num(d.weeks) ?? 28 };
    case 'unverified_14d':
      return { days: num(d.days) ?? 14 };
    case 'lab_unverified_48h':
      return { count: num(d.count) ?? 0 };
    case 'implausible_values':
      return { values: describeImplausible(d) };
    default:
      return {};
  }
}

const IMPLAUSIBLE_LABELS: Record<string, string> = {
  pulse: 'Pulse',
  temperature: 'Temp',
  spo2: 'SpO2',
  weight_kg: 'Weight',
  fetal_heart_rate: 'FHR',
  fundal_height_cm: 'Fundal height',
  test: 'Test',
  value: 'Value',
};

/** "BP 300/20, Pulse 400" for the offending values of an implausible_values issue. */
export function describeImplausible(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  const bp = detail.bp;
  if (bp && typeof bp === 'object') {
    const { systolic, diastolic } = bp as { systolic?: unknown; diastolic?: unknown };
    parts.push(`BP ${String(systolic ?? '?')}/${String(diastolic ?? '?')}`);
  }
  for (const [key, label] of Object.entries(IMPLAUSIBLE_LABELS)) {
    if (detail[key] !== undefined && detail[key] !== null)
      parts.push(`${label} ${String(detail[key])}`);
  }
  return parts.join(', ');
}

/** Valid ranges used to warn while editing a vital (mirrors the SQL rule; see implausible_values). */
export const VITAL_LIMITS = {
  bp_systolic: [60, 260],
  bp_diastolic: [30, 160],
  pulse: [30, 220],
  temperature: [34, 42],
  spo2: [70, 100],
  weight_kg: [30, 200],
  fetal_heart_rate: [60, 220],
  fundal_height_cm: [5, 60],
} as const;
export type VitalKey = keyof typeof VITAL_LIMITS;

/** Vital fields (from a form of strings) that are outside the plausible range. */
export function implausibleVitals(values: Partial<Record<VitalKey, string>>): VitalKey[] {
  const out: VitalKey[] = [];
  for (const key of Object.keys(VITAL_LIMITS) as VitalKey[]) {
    const raw = values[key]?.trim();
    if (!raw) continue;
    const n = Number(raw);
    const [lo, hi] = VITAL_LIMITS[key];
    if (Number.isNaN(n) || n < lo || n > hi) out.push(key);
  }
  const s = Number(values.bp_systolic);
  const d = Number(values.bp_diastolic);
  if (values.bp_systolic && values.bp_diastolic && s <= d) {
    for (const k of ['bp_systolic', 'bp_diastolic'] as const) if (!out.includes(k)) out.push(k);
  }
  return out;
}
