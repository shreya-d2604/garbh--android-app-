// My schedule (PLAN.md §7.4 #9): availability and time-off rules. Pure.
import { z } from 'zod';

import type { AppointmentRow, AvailabilityRow } from './types';

/** 0 = Sunday, matching extract(dow) in doctor_availability.weekday. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** Display order Monday..Sunday. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export function parseTime(text: string): number | null {
  const m = TIME_RE.exec(text.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes since midnight -> "HH:MM". */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Postgres `time` ("10:00:00") -> "10:00". */
export function trimTime(time: string): string {
  const mins = parseTime(time);
  return mins === null ? time : formatTime(mins);
}

export const availabilitySchema = z
  .object({
    start: z.string().refine((v) => parseTime(v) !== null, { error: 'doctor:validation.time' }),
    end: z.string().refine((v) => parseTime(v) !== null, { error: 'doctor:validation.time' }),
    slot: z.string().refine((v) => /^\d{1,3}$/.test(v.trim()) && Number(v) >= 5 && Number(v) <= 120, {
      error: 'doctor:validation.slot',
    }),
  })
  .superRefine((v, ctx) => {
    const s = parseTime(v.start);
    const e = parseTime(v.end);
    if (s !== null && e !== null && s >= e)
      ctx.addIssue({ code: 'custom', message: 'doctor:validation.timeOrder', path: ['end'] });
  });
export type AvailabilityValues = z.infer<typeof availabilitySchema>;

/** True when the new range overlaps another range on the same weekday (ignoring `ignoreId`). */
export function overlapsExisting(
  weekday: number,
  start: string,
  end: string,
  existing: readonly Pick<AvailabilityRow, 'id' | 'weekday' | 'start_time' | 'end_time'>[],
  ignoreId: string | null = null,
): boolean {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null) return false;
  return existing.some((r) => {
    if (r.weekday !== weekday || r.id === ignoreId) return false;
    const rs = parseTime(r.start_time);
    const re = parseTime(r.end_time);
    return rs !== null && re !== null && s < re && rs < e;
  });
}

export function groupByWeekday<T extends Pick<AvailabilityRow, 'weekday' | 'start_time'>>(
  rows: readonly T[],
): { weekday: number; rows: T[] }[] {
  return WEEKDAY_DISPLAY_ORDER.map((weekday) => ({
    weekday,
    rows: rows.filter((r) => r.weekday === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));
}

/** Weekly bookable minutes, for the "N hours a week" summary line. */
export function weeklyMinutes(rows: readonly Pick<AvailabilityRow, 'start_time' | 'end_time'>[]): number {
  return rows.reduce((sum, r) => {
    const s = parseTime(r.start_time);
    const e = parseTime(r.end_time);
    return s !== null && e !== null && e > s ? sum + (e - s) : sum;
  }, 0);
}

const ACTIVE_STATUSES: readonly AppointmentRow['status'][] = ['booked', 'confirmed', 'checked_in'];

/** Booked appointments that overlap a time-off range [startsAt, endsAt), earliest first. */
export function findClashes<T extends Pick<AppointmentRow, 'starts_at' | 'ends_at' | 'status'>>(
  range: { startsAt: string; endsAt: string },
  appointments: readonly T[],
): T[] {
  const s = Date.parse(range.startsAt);
  const e = Date.parse(range.endsAt);
  return appointments
    .filter((a) => ACTIVE_STATUSES.includes(a.status))
    .filter((a) => Date.parse(a.starts_at) < e && Date.parse(a.ends_at) > s)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** Combine a calendar date (YYYY-MM-DD) and "HH:MM" into a local-time ISO instant. */
export function combineDateTime(date: string, time: string): string | null {
  const mins = parseTime(time);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (mins === null || !m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Math.floor(mins / 60), mins % 60);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const timeOffSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'validation.date' }),
    startTime: z.string().refine((v) => parseTime(v) !== null, { error: 'doctor:validation.time' }),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'validation.date' }),
    endTime: z.string().refine((v) => parseTime(v) !== null, { error: 'doctor:validation.time' }),
    reason: z.string(),
  })
  .superRefine((v, ctx) => {
    const s = combineDateTime(v.startDate, v.startTime);
    const e = combineDateTime(v.endDate, v.endTime);
    if (s && e && Date.parse(s) >= Date.parse(e))
      ctx.addIssue({ code: 'custom', message: 'doctor:validation.timeOffOrder', path: ['endDate'] });
  });
export type TimeOffValues = z.infer<typeof timeOffSchema>;
