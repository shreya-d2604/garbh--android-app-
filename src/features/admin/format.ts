// Pure display helpers for the admin screens (unit-tested).
import { format } from 'date-fns';

import { gestationalAge, isISODate, type ISODate } from '@/domain/pregnancy-math';

/** "24w3d" for an EDD on a given day, or null when there is no EDD. */
export function gaLabel(edd: ISODate | null | undefined, on: ISODate): string | null {
  if (!edd || !isISODate(edd)) return null;
  const ga = gestationalAge(edd, on);
  return `${ga.weeks}w${ga.days}d`;
}

/** 0.1234 -> "12%". null stays null (no data). */
export function percent(rate: number | null | undefined): string | null {
  if (rate == null || Number.isNaN(rate)) return null;
  return `${Math.round(rate * 100)}%`;
}

export interface DashboardRow {
  active_pregnancies: number;
  trimester_1: number;
  trimester_2: number;
  trimester_3: number;
  high_risk: number;
  appointments_today: number;
  appointments_week: number;
  no_show_rate: number | null;
  no_show_sample: number;
  ai_pending: number;
  unverified_values: number;
  missed_visits: number;
  unverified_patients: number;
  open_issues: number;
}

export type AttentionKey =
  'openIssues' | 'unverifiedPatients' | 'aiPending' | 'unverifiedValues' | 'missedVisits';

export interface AttentionItem {
  key: AttentionKey;
  count: number;
  /** Where tapping the item goes (undefined = informational). */
  route?: string;
}

export interface DashboardView {
  activePregnancies: number;
  trimesters: { trimester: 1 | 2 | 3; count: number }[];
  /** Active pregnancies that have no date yet, so they fall in no trimester. */
  undated: number;
  highRisk: number;
  appointmentsToday: number;
  appointmentsWeek: number;
  noShow: { percent: string | null; sample: number };
  attention: AttentionItem[];
  /** True when nothing needs attention. */
  allClear: boolean;
}

/** Shapes the one-row result of admin_dashboard_metrics() for the dashboard screen. */
export function shapeMetrics(row: DashboardRow): DashboardView {
  const trimesters = [
    { trimester: 1 as const, count: row.trimester_1 },
    { trimester: 2 as const, count: row.trimester_2 },
    { trimester: 3 as const, count: row.trimester_3 },
  ];
  const dated = trimesters.reduce((sum, t) => sum + t.count, 0);
  const attention: AttentionItem[] = [
    { key: 'openIssues', count: row.open_issues, route: '/admin/data-quality' },
    {
      key: 'unverifiedPatients',
      count: row.unverified_patients,
      route: '/admin/patients?filter=unverified',
    },
    { key: 'aiPending', count: row.ai_pending },
    { key: 'unverifiedValues', count: row.unverified_values },
    { key: 'missedVisits', count: row.missed_visits },
  ];
  return {
    activePregnancies: row.active_pregnancies,
    trimesters,
    undated: Math.max(0, row.active_pregnancies - dated),
    highRisk: row.high_risk,
    appointmentsToday: row.appointments_today,
    appointmentsWeek: row.appointments_week,
    noShow: { percent: percent(row.no_show_rate), sample: row.no_show_sample },
    attention: attention.sort((a, b) => b.count - a.count),
    allClear: attention.every((a) => a.count === 0),
  };
}

/**
 * Makes a search term safe inside a PostgREST `or=(...)` filter: commas, parentheses and wildcards
 * would change the filter's meaning. Returns '' when nothing usable is left.
 */
export function sanitizeSearch(term: string): string {
  return term
    .replace(/[,()*%\\:"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `or` filter string matching the term (ilike) on any of the columns, or null for an empty term. */
export function searchFilter(columns: readonly string[], term: string): string | null {
  const safe = sanitizeSearch(term);
  if (!safe) return null;
  return columns.map((c) => `${c}.ilike.%${safe}%`).join(',');
}

/** Comma / newline separated text -> clean list (and back). */
export function splitList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinList(values: readonly string[] | null | undefined): string {
  return (values ?? []).join(', ');
}

/** '' -> null, otherwise trimmed. For optional text columns. */
export function blankToNull(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  return t === '' ? null : t;
}

/** "5 Oct 2026, 4:30 PM" in the device timezone; '' for a missing or invalid timestamp. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'd MMM yyyy, h:mm a');
}

/** "5 Oct 2026" for a timestamp or a YYYY-MM-DD date. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? '' : format(d, 'd MMM yyyy');
}
