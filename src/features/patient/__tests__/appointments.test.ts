import {
  changeAllowance,
  isActive,
  splitAppointments,
  statusTimeline,
  upcomingLimit,
} from '../appointments';
import { appointment } from '../test-fixtures';

const now = new Date('2026-10-22T06:00:00.000Z');

describe('splitAppointments', () => {
  it('separates upcoming (soonest first) from past (newest first)', () => {
    const list = [
      appointment({
        id: 'later',
        starts_at: '2026-10-30T05:00:00.000Z',
        ends_at: '2026-10-30T05:15:00.000Z',
      }),
      appointment({
        id: 'old',
        starts_at: '2026-09-01T05:00:00.000Z',
        ends_at: '2026-09-01T05:15:00.000Z',
        status: 'completed',
      }),
      appointment({
        id: 'soon',
        starts_at: '2026-10-23T05:00:00.000Z',
        ends_at: '2026-10-23T05:15:00.000Z',
      }),
      appointment({
        id: 'cancelled',
        starts_at: '2026-10-25T05:00:00.000Z',
        ends_at: '2026-10-25T05:15:00.000Z',
        status: 'cancelled',
      }),
      appointment({
        id: 'older',
        starts_at: '2026-08-01T05:00:00.000Z',
        ends_at: '2026-08-01T05:15:00.000Z',
        status: 'no_show',
      }),
    ];
    const { upcoming, past } = splitAppointments(list, now);
    expect(upcoming.map((a) => a.id)).toEqual(['soon', 'later']);
    expect(past.map((a) => a.id)).toEqual(['cancelled', 'old', 'older']);
  });

  it('keeps an in-progress appointment upcoming until it ends', () => {
    const inProgress = appointment({
      id: 'now',
      status: 'in_consultation',
      starts_at: '2026-10-22T05:50:00.000Z',
      ends_at: '2026-10-22T06:05:00.000Z',
    });
    expect(splitAppointments([inProgress], now).upcoming).toHaveLength(1);
  });

  it('treats only booking-flow statuses as active', () => {
    expect(isActive('booked')).toBe(true);
    expect(isActive('checked_in')).toBe(true);
    expect(isActive('completed')).toBe(false);
    expect(isActive('cancelled')).toBe(false);
  });
});

describe('changeAllowance (reschedule / cancel cutoff)', () => {
  const at = (iso: string, status: 'booked' | 'checked_in' = 'booked') =>
    appointment({ starts_at: iso, status });

  it('allows a change well before the cutoff', () => {
    expect(changeAllowance(at('2026-10-22T12:00:00.000Z'), now, 4)).toEqual({
      canChange: true,
      blocked: null,
    });
  });

  it('allows exactly at the cutoff and blocks inside it', () => {
    expect(changeAllowance(at('2026-10-22T10:00:00.000Z'), now, 4).canChange).toBe(true);
    expect(changeAllowance(at('2026-10-22T09:59:00.000Z'), now, 4)).toEqual({
      canChange: false,
      blocked: 'cutoff',
    });
  });

  it('blocks appointments that are already past the booked/confirmed stage', () => {
    expect(changeAllowance(at('2026-10-30T10:00:00.000Z', 'checked_in'), now, 4)).toEqual({
      canChange: false,
      blocked: 'status',
    });
  });

  it('honours a different cutoff from hospital settings', () => {
    expect(changeAllowance(at('2026-10-22T12:00:00.000Z'), now, 8).blocked).toBe('cutoff');
    expect(changeAllowance(at('2026-10-22T12:00:00.000Z'), now, 0).canChange).toBe(true);
  });
});

describe('statusTimeline', () => {
  it('marks done / current / todo steps', () => {
    expect(statusTimeline('checked_in')?.map((s) => s.state)).toEqual([
      'done',
      'current',
      'todo',
      'todo',
    ]);
    expect(statusTimeline('booked')?.map((s) => s.state)).toEqual([
      'current',
      'todo',
      'todo',
      'todo',
    ]);
    expect(statusTimeline('confirmed')?.[0]?.state).toBe('current');
    expect(statusTimeline('completed')?.map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
  });
  it('has no timeline for cancelled or missed appointments', () => {
    expect(statusTimeline('cancelled')).toBeNull();
    expect(statusTimeline('no_show')).toBeNull();
  });
});

describe('upcomingLimit (unverified limit messaging)', () => {
  const settings = { unverified_max_upcoming: 1, verified_max_upcoming: 3 };
  it('limits unverified patients to one upcoming appointment', () => {
    expect(upcomingLimit(false, 0, settings)).toEqual({
      max: 1,
      reached: false,
      kind: 'unverified',
    });
    expect(upcomingLimit(false, 1, settings)).toEqual({
      max: 1,
      reached: true,
      kind: 'unverified',
    });
  });
  it('allows verified patients three', () => {
    expect(upcomingLimit(true, 2, settings).reached).toBe(false);
    expect(upcomingLimit(true, 3, settings)).toEqual({ max: 3, reached: true, kind: 'verified' });
  });
});
