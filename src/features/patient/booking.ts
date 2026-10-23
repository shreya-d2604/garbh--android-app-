// Online-booking helpers and flow state (PLAN.md §7.2 #3, §8.4). The server re-checks every
// rule; this module only shapes slots for display and drives the screen state.
import { addDays, type ISODate } from '@/domain/pregnancy-math';
import type { RpcErrorCode } from '@/domain/rpc-errors';

import { localDayKey } from './dates';
import type { CareTeamMember, DoctorEntry, Slot, Visit } from './types';

export interface DaySlots {
  /** Device-local calendar day, 'YYYY-MM-DD'. */
  key: ISODate;
  slots: Slot[];
}

/** Groups slots by device-local day, drops slots already in the past, sorts ascending. */
export function groupSlotsByDay(slots: Slot[], now: Date = new Date()): DaySlots[] {
  const days = new Map<string, Slot[]>();
  for (const s of [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    if (new Date(s.starts_at) <= now) continue;
    const key = localDayKey(s.starts_at);
    const list = days.get(key);
    if (list) list.push(s);
    else days.set(key, [s]);
  }
  return [...days.entries()].map(([key, list]) => ({ key, slots: list }));
}

/** Date range to ask `available_slots` for: today .. today + min(max advance, 30) days (max 62). */
export function slotRange(today: ISODate, maxAdvanceDays: number): { from: ISODate; to: ISODate } {
  const span = Math.max(1, Math.min(maxAdvanceDays, 30));
  return { from: today, to: addDays(today, span) };
}

/** True when the chosen slot is outside the visit's recommended window (soft warning only). */
export function outsideVisitWindow(
  startsAt: string,
  visit: Pick<Visit, 'due_from' | 'due_to'> | null | undefined,
): boolean {
  if (!visit?.due_from || !visit.due_to) return false;
  const day = localDayKey(startsAt);
  return day < visit.due_from || day > visit.due_to;
}

/**
 * The visit "Book next visit" pre-fills: the first planned, unbooked visit whose window has not
 * closed yet (earliest window first). Falls back to the most recent overdue one.
 */
export function nextPlannedVisit(visits: Visit[], today: ISODate): Visit | null {
  const planned = visits
    .filter((v) => v.status === 'planned' && !v.appointment_id)
    .sort((a, b) => a.seq - b.seq);
  const open = planned.find((v) => !v.due_to || v.due_to >= today);
  if (open) return open;
  return planned.length > 0 ? (planned[planned.length - 1] ?? null) : null;
}

/** Care-team doctors, primary first then backups (by when they were added). */
export function orderedCareTeam(team: CareTeamMember[]): CareTeamMember[] {
  return [...team].sort(
    (a, b) =>
      Number(b.care_role === 'primary') - Number(a.care_role === 'primary') ||
      a.doctor_id.localeCompare(b.doctor_id),
  );
}

/**
 * Doctors the patient may pick: her care team when she has one, otherwise (first booking)
 * the doctors who accept new patients.
 */
export function bookableDoctors(
  team: CareTeamMember[],
  directory: DoctorEntry[],
): { doctor: DoctorEntry; role: 'primary' | 'backup' | null }[] {
  if (team.length > 0) {
    return orderedCareTeam(team).flatMap((m) =>
      m.doctor ? [{ doctor: m.doctor, role: m.care_role }] : [],
    );
  }
  return directory.filter((d) => d.accepts_new_patients).map((doctor) => ({ doctor, role: null }));
}

// ------------------------------------------------------------------ flow state

export type BookingError = RpcErrorCode | 'GENERIC';

export interface BookingState {
  doctorId: string | null;
  /** Selected day key, or null while none is chosen. */
  dayKey: ISODate | null;
  slot: Slot | null;
  phase: 'choosing' | 'submitting' | 'done';
  /** Last server error code (or 'GENERIC' when unknown), shown inline. */
  errorCode: BookingError | null;
  /** The chosen slot was taken by someone else: slots must be re-fetched. */
  needsRefresh: boolean;
}

export type BookingAction =
  | { type: 'selectDoctor'; doctorId: string }
  | { type: 'selectDay'; dayKey: ISODate }
  | { type: 'selectSlot'; slot: Slot }
  | { type: 'submit' }
  | { type: 'succeeded' }
  | { type: 'failed'; code: RpcErrorCode | null }
  | { type: 'refreshed' };

export function initialBookingState(doctorId: string | null = null): BookingState {
  return {
    doctorId,
    dayKey: null,
    slot: null,
    phase: 'choosing',
    errorCode: null,
    needsRefresh: false,
  };
}

export function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case 'selectDoctor':
      if (action.doctorId === state.doctorId) return state;
      return { ...initialBookingState(action.doctorId) };
    case 'selectDay':
      return { ...state, dayKey: action.dayKey, slot: null, errorCode: null };
    case 'selectSlot':
      return { ...state, slot: action.slot, errorCode: null };
    case 'submit':
      return { ...state, phase: 'submitting', errorCode: null };
    case 'succeeded':
      return { ...state, phase: 'done' };
    case 'failed':
      // Someone else grabbed the slot: forget the choice and ask the screen to refresh slots.
      if (action.code === 'SLOT_TAKEN') {
        return {
          ...state,
          phase: 'choosing',
          slot: null,
          errorCode: 'SLOT_TAKEN',
          needsRefresh: true,
        };
      }
      return { ...state, phase: 'choosing', errorCode: action.code ?? 'GENERIC' };
    case 'refreshed':
      return { ...state, needsRefresh: false };
  }
}
