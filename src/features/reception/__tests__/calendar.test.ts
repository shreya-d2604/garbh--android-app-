import {
  appointmentsAffectedByTimeOff,
  buildDayTimeline,
  deskActions,
  groupSlotsByDay,
  holdsSlot,
  localDayRange,
  summarizeDay,
  weekDates,
  weekdayIndex,
  type ApptStatus,
  type TimeOffRow,
} from '../calendar';

const slot = (start: string, end: string) => ({ starts_at: start, ends_at: end });
const appt = (id: string, start: string, end: string, status: ApptStatus = 'booked', doctor_id = 'd1') => ({
  id,
  starts_at: start,
  ends_at: end,
  status,
  doctor_id,
});

describe('buildDayTimeline', () => {
  const slots = [
    slot('2030-01-07T04:30:00Z', '2030-01-07T04:45:00Z'),
    slot('2030-01-07T04:45:00Z', '2030-01-07T05:00:00Z'),
    slot('2030-01-07T05:00:00Z', '2030-01-07T05:15:00Z'),
  ];

  it('interleaves booked appointments and free slots in time order', () => {
    const timeline = buildDayTimeline(slots, [
      appt('a1', '2030-01-07T04:15:00Z', '2030-01-07T04:30:00Z'),
      appt('a2', '2030-01-07T04:45:00Z', '2030-01-07T05:00:00Z', 'checked_in'),
    ]);
    expect(timeline.map((e) => `${e.kind}:${e.starts_at.slice(11, 16)}`)).toEqual([
      'appointment:04:15',
      'free:04:30',
      'appointment:04:45',
      'free:05:00',
    ]);
  });

  it('frees the slot of a cancelled or no-show appointment and hides it', () => {
    const timeline = buildDayTimeline(slots, [
      appt('a1', '2030-01-07T04:30:00Z', '2030-01-07T04:45:00Z', 'cancelled'),
      appt('a2', '2030-01-07T05:00:00Z', '2030-01-07T05:15:00Z', 'no_show'),
    ]);
    expect(timeline.filter((e) => e.kind === 'appointment')).toHaveLength(0);
    expect(timeline.filter((e) => e.kind === 'free')).toHaveLength(3);
  });

  it('can show inactive appointments next to the (free) slot', () => {
    const timeline = buildDayTimeline(
      slots,
      [appt('a1', '2030-01-07T04:30:00Z', '2030-01-07T04:45:00Z', 'cancelled')],
      { showInactive: true },
    );
    expect(timeline.map((e) => e.kind).slice(0, 2)).toEqual(['appointment', 'free']);
  });

  it('drops a free slot that overlaps a live appointment (late realtime update)', () => {
    const timeline = buildDayTimeline(slots, [appt('a1', '2030-01-07T04:40:00Z', '2030-01-07T04:55:00Z')]);
    expect(timeline.filter((e) => e.kind === 'free').map((e) => e.starts_at)).toEqual(['2030-01-07T05:00:00Z']);
  });

  it('returns an empty day as empty', () => {
    expect(buildDayTimeline([], [])).toEqual([]);
  });
});

describe('holdsSlot', () => {
  it('matches the no_doctor_overlap constraint', () => {
    expect(holdsSlot('booked')).toBe(true);
    expect(holdsSlot('completed')).toBe(true);
    expect(holdsSlot('cancelled')).toBe(false);
    expect(holdsSlot('no_show')).toBe(false);
  });
});

describe('weeks and days', () => {
  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex('2026-10-19')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-23')).toBe(4); // Friday
    expect(weekdayIndex('2026-10-25')).toBe(6); // Sunday
  });

  it('lists the Monday-first week around a date, across month ends', () => {
    expect(weekDates('2026-10-23')).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
    expect(weekDates('2026-11-01')[0]).toBe('2026-10-26');
    expect(weekDates('2026-11-01')[6]).toBe('2026-11-01');
  });

  it('groups slots by local day in time order', () => {
    const d1 = new Date(2030, 0, 7, 10, 0).toISOString();
    const d1b = new Date(2030, 0, 7, 10, 15).toISOString();
    const d2 = new Date(2030, 0, 8, 9, 0).toISOString();
    const groups = groupSlotsByDay([
      slot(d2, d2),
      slot(d1b, d1b),
      slot(d1, d1),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2030-01-07', '2030-01-08']);
    expect(groups[0]?.slots.map((s) => s.starts_at)).toEqual([d1, d1b]);
  });

  it('builds a 24-hour local day range', () => {
    const { from, to } = localDayRange('2030-01-07');
    expect(new Date(from).getDate()).toBe(7);
    expect(new Date(to).getDate()).toBe(8);
  });
});

describe('today\'s desk', () => {
  it('offers only the actions the server accepts', () => {
    expect(deskActions('booked')).toEqual(['check_in', 'confirm', 'no_show', 'reschedule', 'cancel']);
    expect(deskActions('confirmed')).toEqual(['check_in', 'no_show', 'reschedule', 'cancel']);
    for (const s of ['checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show'] as const) {
      expect(deskActions(s)).toEqual([]);
    }
  });

  it('summarises the day', () => {
    const statuses: ApptStatus[] = ['booked', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'completed', 'no_show', 'cancelled'];
    expect(summarizeDay(statuses.map((status) => ({ status })))).toEqual({
      waiting: 2, checkedIn: 1, withDoctor: 1, done: 2, missed: 1,
    });
  });
});

describe('appointmentsAffectedByTimeOff', () => {
  const off: TimeOffRow[] = [
    { id: 't1', doctor_id: 'd1', starts_at: '2030-01-07T04:00:00Z', ends_at: '2030-01-07T06:00:00Z', reason: 'Conference' },
    { id: 't2', doctor_id: 'd2', starts_at: '2030-01-08T04:00:00Z', ends_at: '2030-01-08T06:00:00Z', reason: null },
  ];

  it('lists active appointments that overlap their own doctor\'s time off, in time order', () => {
    const result = appointmentsAffectedByTimeOff(
      [
        appt('late', '2030-01-07T05:30:00Z', '2030-01-07T05:45:00Z'),
        appt('early', '2030-01-07T03:50:00Z', '2030-01-07T04:05:00Z', 'confirmed'),
        appt('other-doctor', '2030-01-07T05:00:00Z', '2030-01-07T05:15:00Z', 'booked', 'd2'),
        appt('before', '2030-01-07T03:30:00Z', '2030-01-07T03:45:00Z'),
        appt('touching', '2030-01-07T06:00:00Z', '2030-01-07T06:15:00Z'),
      ],
      off,
    );
    expect(result.map((r) => r.appointment.id)).toEqual(['early', 'late']);
    expect(result[0]?.timeOff.reason).toBe('Conference');
  });

  it('ignores cancelled, no-show, checked-in and completed appointments', () => {
    const statuses: ApptStatus[] = ['cancelled', 'no_show', 'checked_in', 'completed', 'in_consultation'];
    const result = appointmentsAffectedByTimeOff(
      statuses.map((s, i) => appt(`a${i}`, '2030-01-07T05:00:00Z', '2030-01-07T05:15:00Z', s)),
      off,
    );
    expect(result).toEqual([]);
  });

  it('lists an appointment once even when two time-off windows overlap it', () => {
    const result = appointmentsAffectedByTimeOff(
      [appt('a', '2030-01-07T05:00:00Z', '2030-01-07T05:15:00Z')],
      [off[0]!, { ...off[0]!, id: 't3', starts_at: '2030-01-07T04:30:00Z', reason: 'Second' }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.timeOff.id).toBe('t1');
  });
});
