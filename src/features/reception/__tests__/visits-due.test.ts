import { dueKind, selectVisitsDue, type DueVisit } from '../visits-due';
import { sortVerifyQueue } from '../verify-queue';

const TODAY = '2030-03-10';
const v = (over: Partial<DueVisit> & { id: string }): DueVisit => ({
  status: 'planned',
  appointment_id: null,
  due_from: '2030-03-12',
  due_to: '2030-03-20',
  ...over,
});

describe('dueKind', () => {
  it('classifies overdue, open and opening soon', () => {
    expect(dueKind(v({ id: 'a', due_from: '2030-02-01', due_to: '2030-03-09' }), TODAY)).toBe(
      'overdue',
    );
    expect(dueKind(v({ id: 'a', due_from: '2030-03-01', due_to: '2030-03-20' }), TODAY)).toBe(
      'open',
    );
    expect(dueKind(v({ id: 'a', due_from: '2030-03-10', due_to: '2030-03-20' }), TODAY)).toBe(
      'open',
    );
    expect(dueKind(v({ id: 'a', due_from: '2030-03-24', due_to: '2030-04-01' }), TODAY)).toBe(
      'soon',
    );
  });

  it('uses a 14 day horizon, inclusive', () => {
    expect(dueKind(v({ id: 'a', due_from: '2030-03-25' }), TODAY)).toBeNull();
    expect(dueKind(v({ id: 'a', due_from: '2030-03-24' }), TODAY)).toBe('soon');
  });

  it('keeps visits that already have an appointment, or are not planned, off the list', () => {
    expect(dueKind(v({ id: 'a', appointment_id: 'x' }), TODAY)).toBeNull();
    for (const status of ['scheduled', 'completed', 'skipped', 'cancelled']) {
      expect(dueKind(v({ id: 'a', status }), TODAY)).toBeNull();
    }
  });

  it('treats missed visits as overdue and skips visits without dates', () => {
    expect(dueKind(v({ id: 'a', status: 'missed', due_from: '2030-04-01' }), TODAY)).toBe(
      'overdue',
    );
    expect(dueKind(v({ id: 'a', due_from: null, due_to: null }), TODAY)).toBeNull();
  });
});

describe('selectVisitsDue', () => {
  it('orders overdue, then open, then soon, earliest window first', () => {
    const list = selectVisitsDue(
      [
        v({ id: 'soon', due_from: '2030-03-15' }),
        v({ id: 'open-late', due_from: '2030-03-09', due_to: '2030-03-30' }),
        v({ id: 'overdue-new', due_from: '2030-02-20', due_to: '2030-03-05' }),
        v({ id: 'overdue-old', due_from: '2030-01-01', due_to: '2030-01-20' }),
        v({ id: 'open-early', due_from: '2030-03-01', due_to: '2030-03-30' }),
        v({ id: 'far', due_from: '2030-06-01' }),
        v({ id: 'booked', appointment_id: 'appt' }),
      ],
      TODAY,
    );
    expect(list.map((x) => x.id)).toEqual([
      'overdue-old',
      'overdue-new',
      'open-early',
      'open-late',
      'soon',
    ]);
    expect(list.map((x) => x.kind)).toEqual(['overdue', 'overdue', 'open', 'open', 'soon']);
  });

  it('drops a visit as soon as it is booked (self-booking removes it from the list)', () => {
    const before = [v({ id: 'a' })];
    expect(selectVisitsDue(before, TODAY)).toHaveLength(1);
    expect(
      selectVisitsDue([{ ...before[0]!, status: 'scheduled', appointment_id: 'x' }], TODAY),
    ).toHaveLength(0);
  });
});

describe('sortVerifyQueue', () => {
  it("puts today's arrivals first, then the longest-waiting", () => {
    const queue = sortVerifyQueue(
      [
        { id: 'new', created_at: '2030-03-09T10:00:00Z' },
        { id: 'old', created_at: '2030-03-01T10:00:00Z' },
        { id: 'arrives-new', created_at: '2030-03-09T12:00:00Z' },
        { id: 'arrives-old', created_at: '2030-03-02T12:00:00Z' },
      ],
      new Set(['arrives-new', 'arrives-old']),
    );
    expect(queue.map((p) => p.id)).toEqual(['arrives-old', 'arrives-new', 'old', 'new']);
    expect(queue.map((p) => p.arrivesToday)).toEqual([true, true, false, false]);
  });

  it('handles an empty queue', () => {
    expect(sortVerifyQueue([], new Set())).toEqual([]);
  });
});
