// Patient chart (PLAN.md §7.4 #3): timeline and trend series. Pure.
import type {
  ConsultationRow,
  LabResultRow,
  PrescriptionItemRow,
  ReportRow,
  VisitRow,
} from './types';

export type TimelineKind = 'visit' | 'consultation' | 'report';

export interface TimelineEntry {
  kind: TimelineKind;
  id: string;
  /** ISO date or timestamp used for ordering. */
  at: string;
  title: string;
  status: string;
  published?: boolean;
  /** For consultations: the appointment the consultation form opens with. */
  appointmentId?: string | null;
}

/** Newest first. Planned and cancelled visits live in the Visit plan tab, not the timeline. */
export function buildTimeline(
  visits: readonly Pick<VisitRow, 'id' | 'title' | 'status' | 'due_from' | 'created_at'>[],
  consultations: readonly Pick<ConsultationRow, 'id' | 'created_at' | 'published_at' | 'advice' | 'appointment_id'>[],
  reports: readonly Pick<ReportRow, 'id' | 'title' | 'type' | 'report_date' | 'created_at' | 'deleted_at'>[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const v of visits) {
    if (v.status === 'planned' || v.status === 'cancelled') continue;
    entries.push({ kind: 'visit', id: v.id, at: v.due_from ?? v.created_at, title: v.title, status: v.status });
  }
  for (const c of consultations) {
    entries.push({
      kind: 'consultation',
      id: c.id,
      at: c.created_at,
      title: c.advice ?? '',
      status: c.published_at ? 'published' : 'draft',
      published: c.published_at != null,
      appointmentId: c.appointment_id,
    });
  }
  for (const r of reports) {
    if (r.deleted_at) continue;
    entries.push({
      kind: 'report',
      id: r.id,
      at: r.report_date ?? r.created_at,
      title: r.title ?? '',
      status: r.type,
    });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

export interface SeriesPoint {
  /** X label, e.g. "24w". */
  label: string;
  value: number;
  /** ISO date for ordering and tooltips. */
  date: string;
}

type ConsultationVitals = Pick<
  ConsultationRow,
  | 'created_at'
  | 'ga_weeks'
  | 'weight_kg'
  | 'bp_systolic'
  | 'bp_diastolic'
  | 'pulse'
  | 'fundal_height_cm'
  | 'fetal_heart_rate'
>;
export type VitalSeriesKey =
  | 'weight_kg'
  | 'bp_systolic'
  | 'bp_diastolic'
  | 'pulse'
  | 'fundal_height_cm'
  | 'fetal_heart_rate';

/** One series per vital, oldest first, skipping consultations that did not record it. */
export function vitalSeries(
  consultations: readonly ConsultationVitals[],
): Record<VitalSeriesKey, SeriesPoint[]> {
  const sorted = [...consultations].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const build = (key: VitalSeriesKey): SeriesPoint[] =>
    sorted.flatMap((c) => {
      const v = c[key];
      if (v == null) return [];
      return [
        {
          label: c.ga_weeks != null ? `${c.ga_weeks}w` : c.created_at.slice(5, 10),
          value: Number(v),
          date: c.created_at,
        },
      ];
    });
  return {
    weight_kg: build('weight_kg'),
    bp_systolic: build('bp_systolic'),
    bp_diastolic: build('bp_diastolic'),
    pulse: build('pulse'),
    fundal_height_cm: build('fundal_height_cm'),
    fetal_heart_rate: build('fetal_heart_rate'),
  };
}

/** Trend of one lab test: verified numeric values only (PLAN.md §5.2), oldest first. */
export function labSeries(
  results: readonly Pick<LabResultRow, 'test_code' | 'value_num' | 'verified' | 'observed_on' | 'created_at'>[],
  code: string,
): SeriesPoint[] {
  return results
    .filter((r) => r.test_code === code && r.verified && r.value_num != null)
    .map((r) => {
      const date = r.observed_on ?? r.created_at.slice(0, 10);
      return { label: date.slice(5), value: Number(r.value_num), date };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Prescription rows grouped by consultation, newest consultation first. */
export function groupPrescriptions(
  items: readonly PrescriptionItemRow[],
  consultations: readonly Pick<ConsultationRow, 'id' | 'created_at' | 'published_at'>[],
): { consultationId: string; at: string; published: boolean; items: PrescriptionItemRow[] }[] {
  return consultations
    .map((c) => ({
      consultationId: c.id,
      at: c.created_at,
      published: c.published_at != null,
      items: items.filter((i) => i.consultation_id === c.id),
    }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.at.localeCompare(a.at));
}

