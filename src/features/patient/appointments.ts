// Appointment list shaping, status timeline and the reschedule/cancel cutoff (PLAN.md §7.2 #3).
import { differenceInMinutes } from 'date-fns';

import type { Appointment, ApptStatus, HospitalSettings } from './types';

/** Statuses that still count as "upcoming" and block the slot. */
export const ACTIVE_STATUSES: readonly ApptStatus[] = [
  'booked',
  'confirmed',
  'checked_in',
  'in_consultation',
];

export function isActive(status: ApptStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export interface SplitAppointments {
  upcoming: Appointment[];
  past: Appointment[];
}

/** Upcoming = still active and not over yet (soonest first); everything else is past (newest first). */
export function splitAppointments(list: Appointment[], now: Date): SplitAppointments {
  const upcoming: Appointment[] = [];
  const past: Appointment[] = [];
  for (const a of list) {
    if (isActive(a.status) && new Date(a.ends_at) >= now) upcoming.push(a);
    else past.push(a);
  }
  upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  past.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { upcoming, past };
}

export type ChangeBlock = 'status' | 'cutoff';
export interface ChangeAllowance {
  canChange: boolean;
  /** Why not: 'status' = already checked in / finished, 'cutoff' = too close to the start time. */
  blocked: ChangeBlock | null;
}

/**
 * Patients can reschedule/cancel a booked or confirmed appointment until
 * `patient_cancel_cutoff_hours` before it starts (the server enforces the same rule).
 */
export function changeAllowance(
  appt: Pick<Appointment, 'status' | 'starts_at'>,
  now: Date,
  cutoffHours: number,
): ChangeAllowance {
  if (appt.status !== 'booked' && appt.status !== 'confirmed') {
    return { canChange: false, blocked: 'status' };
  }
  const minutesLeft = differenceInMinutes(new Date(appt.starts_at), now);
  if (minutesLeft < cutoffHours * 60) return { canChange: false, blocked: 'cutoff' };
  return { canChange: true, blocked: null };
}

export type TimelineStepKey = 'booked' | 'checked_in' | 'in_consultation' | 'completed';
export interface TimelineStep {
  key: TimelineStepKey;
  state: 'done' | 'current' | 'todo';
}

const STEP_ORDER: TimelineStepKey[] = ['booked', 'checked_in', 'in_consultation', 'completed'];

/** booked -> checked in -> in consultation -> done. Null for cancelled / missed appointments. */
export function statusTimeline(status: ApptStatus): TimelineStep[] | null {
  if (status === 'cancelled' || status === 'no_show') return null;
  const current: TimelineStepKey = status === 'confirmed' ? 'booked' : status;
  const at = STEP_ORDER.indexOf(current);
  return STEP_ORDER.map((key, i) => ({
    key,
    // A finished appointment has every step done; otherwise the current step is highlighted.
    state: status === 'completed' || i < at ? 'done' : i === at ? 'current' : 'todo',
  }));
}

export interface UpcomingLimit {
  max: number;
  reached: boolean;
  /** Which message to show: unverified patients are told to verify at the hospital. */
  kind: 'unverified' | 'verified';
}

/** Online-booking cap (PLAN.md §1): `unverified_max_upcoming` or `verified_max_upcoming`. */
export function upcomingLimit(
  isVerified: boolean,
  upcomingCount: number,
  settings: Pick<HospitalSettings, 'unverified_max_upcoming' | 'verified_max_upcoming'>,
): UpcomingLimit {
  const max = isVerified ? settings.verified_max_upcoming : settings.unverified_max_upcoming;
  return { max, reached: upcomingCount >= max, kind: isVerified ? 'verified' : 'unverified' };
}
