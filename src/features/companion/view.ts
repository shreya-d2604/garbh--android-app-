// Pure data shaping for the read-only companion screens (unit-tested).
import type { Tone } from '@/components';
import { aiSummaryDocumentSchema } from '@/domain/schemas/ai-summary';
import type { Database } from '@/types/database';

type Enums = Database['public']['Enums'];

const ACTIVE_APPOINTMENT: readonly Enums['appt_status'][] = [
  'booked',
  'confirmed',
  'checked_in',
  'in_consultation',
];

/** Upcoming = still active and not over yet (soonest first); everything else is past (newest first). */
export function splitAppointments<
  T extends { ends_at: string; starts_at: string; status: Enums['appt_status'] },
>(rows: readonly T[], now: Date = new Date()): { upcoming: T[]; past: T[] } {
  const t = now.getTime();
  const isUpcoming = (r: T) =>
    ACTIVE_APPOINTMENT.includes(r.status) && new Date(r.ends_at).getTime() >= t;
  return {
    upcoming: rows.filter(isUpcoming).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    past: rows.filter((r) => !isUpcoming(r)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
  };
}

/** Current = not stopped and not past its end date (open-ended counts as current). */
export function splitPrescriptions<
  T extends { is_active: boolean | null; end_date: string | null },
>(items: readonly T[], today: string): { current: T[]; past: T[] } {
  const isCurrent = (i: T) => i.is_active !== false && (i.end_date == null || i.end_date >= today);
  return { current: items.filter(isCurrent), past: items.filter((i) => !isCurrent(i)) };
}

export interface SummaryPreview {
  headline: string;
  text: string | null;
  findings: { finding: string; status: 'normal' | 'attention' | 'urgent'; explanation: string }[];
  lifestyleTips: string[];
  questionsForDoctor: string[];
}

/**
 * Reads a published summary document (`published_summaries.final`). Valid documents are parsed
 * with the shared zod schema; a malformed one still yields its headline/text when present.
 */
export function summaryPreview(final: unknown): SummaryPreview | null {
  const parsed = aiSummaryDocumentSchema.safeParse(final);
  if (parsed.success) {
    const s = parsed.data.summary;
    return {
      headline: s.headline,
      text: s.plain_language_summary || null,
      findings: s.key_findings,
      lifestyleTips: s.lifestyle_tips,
      questionsForDoctor: s.questions_for_doctor,
    };
  }
  const summary = (
    final as { summary?: { headline?: unknown; plain_language_summary?: unknown } } | null
  )?.summary;
  if (typeof summary?.headline !== 'string' || summary.headline === '') return null;
  return {
    headline: summary.headline,
    text:
      typeof summary.plain_language_summary === 'string' ? summary.plain_language_summary : null,
    findings: [],
    lifestyleTips: [],
    questionsForDoctor: [],
  };
}

export function findingTone(status: 'normal' | 'attention' | 'urgent'): Tone {
  return status === 'normal' ? 'success' : status === 'attention' ? 'warning' : 'danger';
}

export function labFlagTone(flag: string | null): Tone {
  switch (flag) {
    case 'normal':
      return 'success';
    case 'low':
    case 'high':
      return 'warning';
    case 'abnormal':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** "11.5 g/dL", "Positive", or null when the report has no value. */
export function labValueText(r: {
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
}): string | null {
  if (r.value_num != null) return r.unit ? `${r.value_num} ${r.unit}` : String(r.value_num);
  return r.value_text;
}

export function visitTone(status: Enums['visit_status']): Tone {
  switch (status) {
    case 'completed':
      return 'success';
    case 'scheduled':
      return 'info';
    case 'missed':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** week_content has rows for weeks 4..42. */
export function contentWeek(weeks: number): number {
  return Math.min(42, Math.max(4, weeks));
}

export function groupBy<T, K extends string>(
  rows: readonly T[],
  key: (row: T) => K,
): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const row of rows) (out[key(row)] ??= []).push(row);
  return out;
}
