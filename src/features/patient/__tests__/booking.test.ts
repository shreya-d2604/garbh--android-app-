import {
  bookableDoctors,
  bookingReducer,
  groupSlotsByDay,
  initialBookingState,
  nextPlannedVisit,
  orderedCareTeam,
  outsideVisitWindow,
  slotRange,
} from '../booking';
import { doctor, member, visit } from '../test-fixtures';

// Local-time constructors so the tests do not depend on the machine timezone.
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();
const slot = (y: number, m: number, d: number, h: number, min = 0) => ({
  starts_at: local(y, m, d, h, min),
  ends_at: local(y, m, d, h, min + 15),
});

describe('groupSlotsByDay', () => {
  it('groups by local day, sorts ascending and drops past slots', () => {
    const now = new Date(2026, 9, 22, 10, 0);
    const days = groupSlotsByDay(
      [
        slot(2026, 10, 23, 11),
        slot(2026, 10, 22, 9),
        slot(2026, 10, 22, 12),
        slot(2026, 10, 23, 10, 30),
      ],
      now,
    );
    expect(days.map((d) => d.key)).toEqual(['2026-10-22', '2026-10-23']);
    expect(days[0]?.slots).toHaveLength(1);
    expect(days[1]?.slots.map((s) => s.starts_at)).toEqual([
      slot(2026, 10, 23, 10, 30).starts_at,
      slot(2026, 10, 23, 11).starts_at,
    ]);
  });

  it('returns nothing for no slots', () => {
    expect(groupSlotsByDay([])).toEqual([]);
  });
});

describe('slotRange', () => {
  it('asks for up to 30 days, never more than the advance window', () => {
    expect(slotRange('2026-10-22', 60)).toEqual({ from: '2026-10-22', to: '2026-11-21' });
    expect(slotRange('2026-10-22', 7)).toEqual({ from: '2026-10-22', to: '2026-10-29' });
  });
});

describe('outsideVisitWindow (soft warning)', () => {
  const v = visit({ due_from: '2026-03-04', due_to: '2026-03-18' });
  it('is false inside the window, including the edges', () => {
    expect(outsideVisitWindow(local(2026, 3, 4, 10), v)).toBe(false);
    expect(outsideVisitWindow(local(2026, 3, 18, 17), v)).toBe(false);
  });
  it('is true before or after the window', () => {
    expect(outsideVisitWindow(local(2026, 3, 3, 10), v)).toBe(true);
    expect(outsideVisitWindow(local(2026, 3, 19, 10), v)).toBe(true);
  });
  it('is false without a visit or without dates', () => {
    expect(outsideVisitWindow(local(2026, 3, 3, 10), null)).toBe(false);
    expect(outsideVisitWindow(local(2026, 3, 3, 10), visit({ due_from: null, due_to: null }))).toBe(
      false,
    );
  });
});

describe('nextPlannedVisit', () => {
  it('pre-fills the first planned, unbooked visit whose window is still open', () => {
    const visits = [
      visit({ id: 'done', seq: 1, status: 'completed' }),
      visit({ id: 'booked', seq: 2, status: 'scheduled', appointment_id: 'a' }),
      visit({ id: 'next', seq: 3, due_to: '2026-11-30' }),
      visit({ id: 'later', seq: 4, due_to: '2026-12-30' }),
    ];
    expect(nextPlannedVisit(visits, '2026-10-22')?.id).toBe('next');
  });
  it('skips windows that have closed, falling back to the latest overdue visit', () => {
    const visits = [
      visit({ id: 'a', seq: 1, due_to: '2026-01-10' }),
      visit({ id: 'b', seq: 2, due_to: '2026-02-10' }),
    ];
    expect(nextPlannedVisit(visits, '2026-10-22')?.id).toBe('b');
    expect(nextPlannedVisit([], '2026-10-22')).toBeNull();
  });
});

describe('care team doctors', () => {
  const primary = member({
    id: '1',
    doctor_id: 'p',
    care_role: 'primary',
    doctor: doctor({ id: 'p', full_name: 'Dr. P' }),
  });
  const backup = member({
    id: '2',
    doctor_id: 'b',
    care_role: 'backup',
    doctor: doctor({ id: 'b', full_name: 'Dr. B' }),
  });

  it('lists the primary first, then backups', () => {
    expect(orderedCareTeam([backup, primary]).map((m) => m.care_role)).toEqual([
      'primary',
      'backup',
    ]);
  });

  it('offers the care team when she has one', () => {
    const list = bookableDoctors([backup, primary], [doctor({ id: 'x' })]);
    expect(list.map((d) => `${d.doctor.id}:${d.role}`)).toEqual(['p:primary', 'b:backup']);
  });

  it('offers doctors accepting new patients when she has no care team (first booking)', () => {
    const list = bookableDoctors(
      [],
      [
        doctor({ id: 'yes', accepts_new_patients: true }),
        doctor({ id: 'no', accepts_new_patients: false }),
      ],
    );
    expect(list.map((d) => d.doctor.id)).toEqual(['yes']);
    expect(list[0]?.role).toBeNull();
  });
});

describe('bookingReducer', () => {
  const s1 = slot(2026, 10, 23, 11);

  it('walks doctor -> day -> slot -> submit -> success', () => {
    let s = initialBookingState();
    s = bookingReducer(s, { type: 'selectDoctor', doctorId: 'd1' });
    s = bookingReducer(s, { type: 'selectDay', dayKey: '2026-10-23' });
    s = bookingReducer(s, { type: 'selectSlot', slot: s1 });
    expect(s).toMatchObject({ doctorId: 'd1', dayKey: '2026-10-23', slot: s1, phase: 'choosing' });
    s = bookingReducer(s, { type: 'submit' });
    expect(s.phase).toBe('submitting');
    s = bookingReducer(s, { type: 'succeeded' });
    expect(s.phase).toBe('done');
  });

  it('changing doctor clears the day and slot', () => {
    let s = bookingReducer(initialBookingState('d1'), { type: 'selectDay', dayKey: '2026-10-23' });
    s = bookingReducer(s, { type: 'selectSlot', slot: s1 });
    s = bookingReducer(s, { type: 'selectDoctor', doctorId: 'd2' });
    expect(s).toMatchObject({ doctorId: 'd2', dayKey: null, slot: null });
  });

  it('SLOT_TAKEN clears the slot, keeps the day and asks for a refresh', () => {
    let s = bookingReducer(initialBookingState('d1'), { type: 'selectDay', dayKey: '2026-10-23' });
    s = bookingReducer(s, { type: 'selectSlot', slot: s1 });
    s = bookingReducer(s, { type: 'submit' });
    s = bookingReducer(s, { type: 'failed', code: 'SLOT_TAKEN' });
    expect(s).toMatchObject({
      phase: 'choosing',
      slot: null,
      dayKey: '2026-10-23',
      errorCode: 'SLOT_TAKEN',
      needsRefresh: true,
    });
    s = bookingReducer(s, { type: 'refreshed' });
    expect(s.needsRefresh).toBe(false);
  });

  it('other errors keep the slot and need no refresh; unknown errors become GENERIC', () => {
    let s = bookingReducer(initialBookingState('d1'), { type: 'selectSlot', slot: s1 });
    s = bookingReducer(s, { type: 'submit' });
    s = bookingReducer(s, { type: 'failed', code: 'NOT_IMPLEMENTED' });
    expect(s).toMatchObject({
      errorCode: 'NOT_IMPLEMENTED',
      slot: s1,
      needsRefresh: false,
      phase: 'choosing',
    });
    s = bookingReducer(s, { type: 'failed', code: null });
    expect(s.errorCode).toBe('GENERIC');
  });

  it('picking a new slot clears the previous error', () => {
    let s = bookingReducer(initialBookingState('d1'), { type: 'failed', code: 'MAX_UPCOMING' });
    s = bookingReducer(s, { type: 'selectSlot', slot: s1 });
    expect(s.errorCode).toBeNull();
  });
});
