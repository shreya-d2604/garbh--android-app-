// Pregnancy math (PLAN.md §10). Client-side mirror of SQL public.ga_from_edd() /
// generate_visit_plan(); the database is the source of truth. Both are tested against the
// same vectors (supabase/tests/head_01_gestational_age.test.sql).
//
// All dates are ISO calendar dates ('YYYY-MM-DD') handled as UTC day numbers, so the result
// never depends on the device timezone or DST.

export type ISODate = string;

export interface GestationalAge {
  weeks: number;
  days: number;
  trimester: 1 | 2 | 3;
  daysToEdd: number;
  /** Days since day 0 (edd - 280). */
  totalDays: number;
}

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const PREGNANCY_DAYS = 280;
export const POST_TERM_WEEKS = 41;

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

export function toDayNumber(iso: ISODate): number {
  if (!isISODate(iso)) throw new Error(`Invalid ISO date: ${iso}`);
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
}

export function fromDayNumber(day: number): ISODate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** a - b in days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** Today's calendar date on this device. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Naegele's rule: EDD = LMP + 280 days. */
export function eddFromLmp(lmp: ISODate): ISODate {
  return addDays(lmp, PREGNANCY_DAYS);
}

export function lmpFromEdd(edd: ISODate): ISODate {
  return addDays(edd, -PREGNANCY_DAYS);
}

/** edd_final = dating-scan EDD if set, otherwise LMP + 280. */
export function eddFinal(lmp: ISODate | null, eddUsg: ISODate | null): ISODate | null {
  if (eddUsg) return eddUsg;
  return lmp ? eddFromLmp(lmp) : null;
}

export function trimesterForWeeks(weeks: number): 1 | 2 | 3 {
  if (weeks < 14) return 1;
  if (weeks < 28) return 2;
  return 3;
}

export function gestationalAge(edd: ISODate, on: ISODate): GestationalAge {
  const totalDays = diffDays(on, lmpFromEdd(edd));
  const weeks = Math.floor(totalDays / 7);
  return {
    weeks,
    days: totalDays - weeks * 7,
    trimester: trimesterForWeeks(weeks),
    daysToEdd: diffDays(edd, on),
    totalDays,
  };
}

export function isPostTerm(ga: GestationalAge): boolean {
  return ga.weeks >= POST_TERM_WEEKS;
}

/** 0..1 progress from day 0 to the EDD (for the journey progress ring). */
export function progressToEdd(ga: GestationalAge): number {
  return Math.min(1, Math.max(0, ga.totalDays / PREGNANCY_DAYS));
}

/** Visit due window, mirroring generate_visit_plan(): [start_week+0d, end_week+6d]. */
export function visitWindow(
  edd: ISODate,
  windowStartWeek: number,
  windowEndWeek: number,
): { dueFrom: ISODate; dueTo: ISODate } {
  const start = lmpFromEdd(edd);
  return {
    dueFrom: addDays(start, windowStartWeek * 7),
    dueTo: addDays(start, windowEndWeek * 7 + 6),
  };
}
