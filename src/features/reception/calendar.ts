// Pure helpers for the appointment book, today's desk and the doctor-unavailable worklist.
// No React, no Supabase: everything here is unit-tested (see __tests__/calendar.test.ts).
import { addDays, toDayNumber, type ISODate } from '@/domain/pregnancy-math';
import type { Database } from '@/types/database';

export type ApptStatus = Database['public']['Enums']['appt_status'];

export interface SlotRow {
  starts_at: string;
  ends_at: string;
}

export interface TimedAppointment extends SlotRow {
  id: string;
  status: ApptStatus;
}

/** An appointment keeps its slot unless it was cancelled or the patient did not come (see the no_doctor_overlap constraint). */
export function holdsSlot(status: ApptStatus): boolean {
  return status !== 'cancelled' && status !== 'no_show';
}

export type TimelineEntry<A extends TimedAppointment> =
  | { kind: 'free'; key: string; starts_at: string; ends_at: string }
  | { kind: 'appointment'; key: string; starts_at: string; ends_at: string; appointment: A };

const ms = (iso: string) => Date.parse(iso);
const overlaps = (a: SlotRow, b: SlotRow) =>
  ms(a.starts_at) < ms(b.ends_at) && ms(b.starts_at) < ms(a.ends_at);

/**
 * One doctor, one day: booked appointments and the remaining free slots in time order.
 * Cancelled / no-show appointments are hidden (their slot is free again) unless `showInactive`.
 * A free slot that overlaps a live appointment is dropped (a realtime update may arrive late).
 */
export function buildDayTimeline<A extends TimedAppointment>(
  slots: readonly SlotRow[],
  appointments: readonly A[],
  options: { showInactive?: boolean } = {},
): TimelineEntry<A>[] {
  const shown = appointments.filter((a) => options.showInactive || holdsSlot(a.status));
  const live = appointments.filter((a) => holdsSlot(a.status));
  const entries: TimelineEntry<A>[] = [
    ...shown.map((a) => ({
      kind: 'appointment' as const,
      key: `a:${a.id}`,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      appointment: a,
    })),
    ...slots
      .filter((s) => !live.some((a) => overlaps(s, a)))
      .map((s) => ({
        kind: 'free' as const,
        key: `s:${s.starts_at}`,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
      })),
  ];
  return entries.sort(
    (x, y) =>
      ms(x.starts_at) - ms(y.starts_at) ||
      (x.kind === y.kind ? 0 : x.kind === 'appointment' ? -1 : 1),
  );
}

/** Local calendar date of a timestamp, as YYYY-MM-DD (device timezone). */
export function localDateOf(iso: string): ISODate {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Slots grouped by local day, days and slots in time order. */
export function groupSlotsByDay<S extends SlotRow>(
  slots: readonly S[],
): { date: ISODate; slots: S[] }[] {
  const byDay = new Map<ISODate, S[]>();
  for (const s of [...slots].sort((a, b) => ms(a.starts_at) - ms(b.starts_at))) {
    const day = localDateOf(s.starts_at);
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  return [...byDay.entries()].map(([date, daySlots]) => ({ date, slots: daySlots }));
}

/** Monday = 0 ... Sunday = 6. */
export function weekdayIndex(iso: ISODate): number {
  return (toDayNumber(iso) + 3) % 7;
}

/** The seven dates (Monday first) of the week containing `iso`. */
export function weekDates(iso: ISODate): ISODate[] {
  const monday = addDays(iso, -weekdayIndex(iso));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** [start of the local day, start of the next day) as ISO instants for range queries. */
export function localDayRange(iso: ISODate): { from: string; to: string } {
  const [y, m, d] = iso.split('-').map(Number);
  return {
    from: new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toISOString(),
    to: new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1).toISOString(),
  };
}

// ---------------------------------------------------------------- today's desk

export type DeskAction = 'check_in' | 'confirm' | 'no_show' | 'reschedule' | 'cancel';

/** Buttons reception may show for an appointment (mirrors set_appointment_status / cancel rules). */
export function deskActions(status: ApptStatus): DeskAction[] {
  switch (status) {
    case 'booked':
      return ['check_in', 'confirm', 'no_show', 'reschedule', 'cancel'];
    case 'confirmed':
      return ['check_in', 'no_show', 'reschedule', 'cancel'];
    default:
      return [];
  }
}

export interface DaySummary {
  waiting: number;
  checkedIn: number;
  withDoctor: number;
  done: number;
  missed: number;
}

export function summarizeDay(appointments: readonly { status: ApptStatus }[]): DaySummary {
  const s: DaySummary = { waiting: 0, checkedIn: 0, withDoctor: 0, done: 0, missed: 0 };
  for (const a of appointments) {
    if (a.status === 'booked' || a.status === 'confirmed') s.waiting += 1;
    else if (a.status === 'checked_in') s.checkedIn += 1;
    else if (a.status === 'in_consultation') s.withDoctor += 1;
    else if (a.status === 'completed') s.done += 1;
    else if (a.status === 'no_show') s.missed += 1;
  }
  return s;
}

// ---------------------------------------------------------------- doctor unavailable

/** One row of `appointments_needing_rebook()` (server-side: time-off clash and/or off care team). */
export interface RebookRow {
  appointment_id: string;
  off_care_team: boolean;
  time_off_id: string | null;
  time_off_starts_at: string | null;
  time_off_ends_at: string | null;
  time_off_reason: string | null;
}

export interface TimeOffRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export interface AffectedAppointment<A extends { id: string }> {
  appointment: A;
  /** The doctor is no longer on this pregnancy's active care team. */
  offCareTeam: boolean;
  /** The first time-off window of the doctor that the appointment overlaps, if any. */
  timeOff: TimeOffRow | null;
}

/**
 * Joins the server's worklist rows with the appointment rows, keeping the server's order and
 * dropping rows whose appointment could not be loaded (e.g. changed in the meantime).
 */
export function mergeRebookRows<A extends { id: string }>(
  rows: readonly RebookRow[],
  appointments: readonly A[],
): AffectedAppointment<A>[] {
  const byId = new Map(appointments.map((a) => [a.id, a]));
  const result: AffectedAppointment<A>[] = [];
  for (const r of rows) {
    const appointment = byId.get(r.appointment_id);
    if (!appointment) continue;
    result.push({
      appointment,
      offCareTeam: r.off_care_team,
      timeOff:
        r.time_off_id && r.time_off_starts_at && r.time_off_ends_at
          ? {
              id: r.time_off_id,
              starts_at: r.time_off_starts_at,
              ends_at: r.time_off_ends_at,
              reason: r.time_off_reason,
            }
          : null,
    });
  }
  return result;
}
