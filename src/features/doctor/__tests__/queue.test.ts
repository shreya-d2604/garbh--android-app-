import {
  canStart,
  dayRange,
  groupQueue,
  queueChips,
  queueCounts,
  queueGroupFor,
  toQueueItem,
  type QueueItem,
  type QueueRow,
} from '../queue';

const item = (over: Partial<QueueItem>): QueueItem => ({
  id: 'a',
  startsAt: '2026-10-23T05:30:00.000Z',
  endsAt: '2026-10-23T05:45:00.000Z',
  status: 'booked',
  reason: null,
  channel: 'reception',
  pregnancyId: 'p',
  patientId: 'pt',
  patientName: 'Kavya',
  mrn: 'GH-1',
  verified: true,
  eddFinal: null,
  riskLevel: 'low',
  ...over,
});

describe('today queue', () => {
  it('groups by status with active groups first and each group sorted by time', () => {
    const groups = groupQueue([
      item({ id: 'late', startsAt: '2026-10-23T09:00:00.000Z' }),
      item({ id: 'early', startsAt: '2026-10-23T04:00:00.000Z', status: 'confirmed' }),
      item({ id: 'in', status: 'in_consultation' }),
      item({ id: 'ci', status: 'checked_in' }),
      item({ id: 'done', status: 'completed' }),
      item({ id: 'x', status: 'cancelled' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      'in_consultation',
      'checked_in',
      'booked',
      'done',
      'closed',
    ]);
    expect(groups[2]?.items.map((i) => i.id)).toEqual(['early', 'late']);
  });

  it('drops empty groups', () => {
    expect(groupQueue([])).toEqual([]);
    expect(groupQueue([item({})]).map((g) => g.key)).toEqual(['booked']);
  });

  it('maps every status to a group', () => {
    expect(queueGroupFor('no_show')).toBe('closed');
    expect(queueGroupFor('confirmed')).toBe('booked');
    expect(queueGroupFor('completed')).toBe('done');
  });

  it('counts waiting, in consultation and done without cancelled ones', () => {
    const counts = queueCounts([
      item({ status: 'booked' }),
      item({ status: 'checked_in' }),
      item({ status: 'in_consultation' }),
      item({ status: 'completed' }),
      item({ status: 'no_show' }),
    ]);
    expect(counts).toEqual({ total: 4, waiting: 1, inConsultation: 1, done: 1 });
  });

  it('allows starting only before the consultation', () => {
    expect(canStart('booked')).toBe(true);
    expect(canStart('confirmed')).toBe(true);
    expect(canStart('checked_in')).toBe(true);
    expect(canStart('in_consultation')).toBe(false);
    expect(canStart('completed')).toBe(false);
    expect(canStart('cancelled')).toBe(false);
  });

  it('shows the App chip for app bookings and New · Unverified for unverified patients', () => {
    expect(queueChips({ channel: 'app', verified: false })).toEqual({
      app: true,
      newUnverified: true,
    });
    expect(queueChips({ channel: 'reception', verified: true })).toEqual({
      app: false,
      newUnverified: false,
    });
  });

  it('maps a joined row and tolerates missing joins', () => {
    const row: QueueRow = {
      id: 'a1',
      starts_at: 's',
      ends_at: 'e',
      status: 'booked',
      reason: 'Routine',
      booking_channel: 'app',
      pregnancy_id: 'p1',
      patient_id: 'pt1',
      patients: { full_name: 'Kavya Iyer', mrn: null, is_verified: false },
      pregnancies: { edd_final: '2027-01-10', risk_level: 'high' },
    };
    expect(toQueueItem(row)).toMatchObject({
      patientName: 'Kavya Iyer',
      verified: false,
      riskLevel: 'high',
      channel: 'app',
    });
    expect(toQueueItem({ ...row, patients: null, pregnancies: null })).toMatchObject({
      patientName: '',
      verified: false,
      riskLevel: 'low',
      eddFinal: null,
    });
  });

  it('computes the device-local day range', () => {
    const { from, to } = dayRange(new Date(2026, 9, 23, 15, 30));
    expect(new Date(from).getTime()).toBe(new Date(2026, 9, 23).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2026, 9, 24).getTime());
  });
});
