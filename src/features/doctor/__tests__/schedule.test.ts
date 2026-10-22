import {
  availabilitySchema,
  combineDateTime,
  findClashes,
  formatTime,
  groupByWeekday,
  overlapsExisting,
  parseTime,
  timeOffSchema,
  trimTime,
  weeklyMinutes,
} from '../schedule';

const msgs = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, v: object) => {
  const r = schema.safeParse(v);
  return r.success ? [] : (r.error?.issues ?? []).map((i) => `${i.path.join('.')}:${i.message}`);
};

describe('time helpers', () => {
  it('parses and formats HH:MM and database time values', () => {
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime('9:05')).toBe(545);
    expect(parseTime('10:00:00')).toBe(600);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('ab')).toBeNull();
    expect(formatTime(570)).toBe('09:30');
    expect(trimTime('14:00:00')).toBe('14:00');
  });
});

describe('availability', () => {
  it('needs valid times, start before end and a 5-120 minute slot', () => {
    expect(msgs(availabilitySchema, { start: '10:00', end: '13:00', slot: '15' })).toEqual([]);
    expect(msgs(availabilitySchema, { start: '13:00', end: '10:00', slot: '15' })).toEqual(['end:doctor:validation.timeOrder']);
    expect(msgs(availabilitySchema, { start: '25:00', end: '10:00', slot: '15' })).toContain('start:doctor:validation.time');
    expect(msgs(availabilitySchema, { start: '10:00', end: '13:00', slot: '4' })).toEqual(['slot:doctor:validation.slot']);
    expect(msgs(availabilitySchema, { start: '10:00', end: '13:00', slot: '121' })).toEqual(['slot:doctor:validation.slot']);
  });

  it('detects overlaps on the same weekday only', () => {
    const existing = [
      { id: 'a', weekday: 1, start_time: '10:00:00', end_time: '13:00:00' },
      { id: 'b', weekday: 2, start_time: '10:00:00', end_time: '13:00:00' },
    ];
    expect(overlapsExisting(1, '12:00', '14:00', existing)).toBe(true);
    expect(overlapsExisting(1, '13:00', '14:00', existing)).toBe(false);
    expect(overlapsExisting(3, '10:00', '13:00', existing)).toBe(false);
    expect(overlapsExisting(1, '12:00', '14:00', existing, 'a')).toBe(false);
  });

  it('groups by weekday Monday to Sunday and sums weekly minutes', () => {
    const rows = [
      { id: '1', weekday: 0, start_time: '09:00:00', end_time: '10:00:00' },
      { id: '2', weekday: 1, start_time: '14:00:00', end_time: '16:00:00' },
      { id: '3', weekday: 1, start_time: '10:00:00', end_time: '12:00:00' },
    ];
    const groups = groupByWeekday(rows);
    expect(groups.map((g) => g.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(['3', '2']);
    expect(weeklyMinutes(rows)).toBe(60 + 120 + 120);
  });
});

describe('time off', () => {
  const appts = [
    { starts_at: '2026-10-26T04:30:00Z', ends_at: '2026-10-26T04:45:00Z', status: 'booked' as const },
    { starts_at: '2026-10-26T05:30:00Z', ends_at: '2026-10-26T05:45:00Z', status: 'cancelled' as const },
    { starts_at: '2026-10-26T06:00:00Z', ends_at: '2026-10-26T06:15:00Z', status: 'checked_in' as const },
    { starts_at: '2026-10-27T04:30:00Z', ends_at: '2026-10-27T04:45:00Z', status: 'booked' as const },
    { starts_at: '2026-10-26T03:45:00Z', ends_at: '2026-10-26T04:00:00Z', status: 'completed' as const },
  ];

  it('lists only active appointments that overlap the range, earliest first', () => {
    const clashes = findClashes({ startsAt: '2026-10-26T04:00:00Z', endsAt: '2026-10-26T18:00:00Z' }, appts);
    expect(clashes.map((a) => a.starts_at)).toEqual(['2026-10-26T04:30:00Z', '2026-10-26T06:00:00Z']);
  });

  it('treats the range as half-open: an appointment ending exactly at the start does not clash', () => {
    expect(findClashes({ startsAt: '2026-10-26T04:45:00Z', endsAt: '2026-10-26T05:00:00Z' }, appts)).toEqual([]);
  });

  it('combines a date and time in local time', () => {
    const iso = combineDateTime('2026-10-26', '09:30');
    expect(iso).not.toBeNull();
    const d = new Date(iso as string);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 26, 9, 30]);
    expect(combineDateTime('26/10/2026', '09:30')).toBeNull();
    expect(combineDateTime('2026-10-26', '99:99')).toBeNull();
  });

  it('requires the end to be after the start', () => {
    const ok = { startDate: '2026-10-26', startTime: '09:00', endDate: '2026-10-28', endTime: '18:00', reason: '' };
    expect(msgs(timeOffSchema, ok)).toEqual([]);
    expect(msgs(timeOffSchema, { ...ok, endDate: '2026-10-26', endTime: '08:00' })).toEqual(['endDate:doctor:validation.timeOffOrder']);
    expect(msgs(timeOffSchema, { ...ok, startDate: 'bad' })).toContain('startDate:validation.date');
  });
});
