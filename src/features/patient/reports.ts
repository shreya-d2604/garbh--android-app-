// Reports, lab values and trends (PLAN.md §7.2 #5). Only verified values are ever charted.
import { gestationalAge, type ISODate } from '@/domain/pregnancy-math';

import { localDayKey } from './dates';
import type { Consultation, LabResult, PublishedSummary, Report } from './types';

export type TrimesterGroup = 1 | 2 | 3 | 0; // 0 = date unknown

export interface ReportGroup {
  trimester: TrimesterGroup;
  reports: Report[];
}

/** The day a report belongs to: its report date, else the day it was added. */
export function reportDay(report: Pick<Report, 'report_date' | 'created_at'>): ISODate {
  return report.report_date ?? localDayKey(report.created_at);
}

export function trimesterOn(edd: ISODate | null, day: ISODate): TrimesterGroup {
  if (!edd) return 0;
  const ga = gestationalAge(edd, day);
  return ga.totalDays < 0 ? 1 : ga.trimester;
}

/** Newest trimester first; inside a trimester newest report first. */
export function groupReportsByTrimester(reports: Report[], edd: ISODate | null): ReportGroup[] {
  const groups = new Map<TrimesterGroup, Report[]>();
  for (const r of reports) {
    const t = trimesterOn(edd, reportDay(r));
    const list = groups.get(t);
    if (list) list.push(r);
    else groups.set(t, [r]);
  }
  const rank = (t: TrimesterGroup) => (t === 0 ? -1 : t);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(b) - rank(a))
    .map(([trimester, list]) => ({
      trimester,
      reports: list.sort((a, b) => reportDay(b).localeCompare(reportDay(a))),
    }));
}

/** "Doctor reviewed": the doctor verified the report, or approved a summary of it. */
export function isDoctorReviewed(
  report: Pick<Report, 'id' | 'verified_at'>,
  summaries: Pick<PublishedSummary, 'source_type' | 'source_id'>[],
): boolean {
  return (
    report.verified_at != null ||
    summaries.some((s) => s.source_type === 'report' && s.source_id === report.id)
  );
}

export type LabFlag = 'low' | 'high' | 'normal' | 'abnormal';

/** The stored flag, or one worked out from the reference range. Null when it cannot be told. */
export function labFlag(
  r: Pick<LabResult, 'flag' | 'value_num' | 'ref_low' | 'ref_high'>,
): LabFlag | null {
  if (r.flag === 'low' || r.flag === 'high' || r.flag === 'normal' || r.flag === 'abnormal') {
    return r.flag;
  }
  if (r.value_num == null) return null;
  if (r.ref_low != null && r.value_num < r.ref_low) return 'low';
  if (r.ref_high != null && r.value_num > r.ref_high) return 'high';
  return r.ref_low != null || r.ref_high != null ? 'normal' : null;
}

/** "11 – 15", "up to 120", "from 11"; null without a range. */
export function referenceRange(r: Pick<LabResult, 'ref_low' | 'ref_high'>): {
  kind: 'between' | 'upTo' | 'from';
  low?: number;
  high?: number;
} | null {
  if (r.ref_low != null && r.ref_high != null)
    return { kind: 'between', low: r.ref_low, high: r.ref_high };
  if (r.ref_high != null) return { kind: 'upTo', high: r.ref_high };
  if (r.ref_low != null) return { kind: 'from', low: r.ref_low };
  return null;
}

// ------------------------------------------------------------------ trends

export interface TrendPoint {
  value: number;
  /** Short axis label, e.g. "24w". */
  label: string;
  date: ISODate;
}

export interface Trends {
  hb: TrendPoint[];
  weight: TrendPoint[];
  systolic: TrendPoint[];
  diastolic: TrendPoint[];
  fastingSugar: TrendPoint[];
  postMealSugar: TrendPoint[];
}

const labelFor = (edd: ISODate | null, day: ISODate, weeks?: number | null): string => {
  if (weeks != null) return `${weeks}w`;
  if (!edd) return day.slice(5);
  const ga = gestationalAge(edd, day);
  return `${Math.max(0, ga.weeks)}w`;
};

const byDate = (a: TrendPoint, b: TrendPoint) => a.date.localeCompare(b.date);

/**
 * Builds chart series. Lab values must be `verified`; consultations must be published.
 * Points are ordered by date and labelled by gestational week.
 */
export function buildTrends(
  labResults: LabResult[],
  consultations: Consultation[],
  edd: ISODate | null,
): Trends {
  const lab = (code: string): TrendPoint[] =>
    labResults
      .filter((r) => r.verified && r.test_code === code && r.value_num != null)
      .map((r) => {
        const date = r.observed_on ?? localDayKey(r.created_at);
        return { value: r.value_num as number, date, label: labelFor(edd, date) };
      })
      .sort(byDate);

  const published = consultations.filter((c) => c.published_at != null);
  const vital = (pick: (c: Consultation) => number | null): TrendPoint[] =>
    published
      .flatMap((c) => {
        const value = pick(c);
        if (value == null) return [];
        const date = localDayKey(c.published_at ?? c.created_at);
        return [{ value, date, label: labelFor(edd, date, c.ga_weeks) }];
      })
      .sort(byDate);

  return {
    hb: lab('HB'),
    weight: vital((c) => c.weight_kg),
    systolic: vital((c) => c.bp_systolic),
    diastolic: vital((c) => c.bp_diastolic),
    fastingSugar: lab('FBS'),
    postMealSugar: lab('PPBS'),
  };
}

export function hasAnyTrend(t: Trends): boolean {
  return Object.values(t).some((points) => points.length > 0);
}
