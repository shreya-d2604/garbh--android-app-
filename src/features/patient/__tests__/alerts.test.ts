import { homeAlerts } from '../alerts';
import { visit } from '../test-fixtures';

const today = '2026-03-10';

describe('homeAlerts', () => {
  it('alerts for a planned visit whose window is open and not booked', () => {
    const a = homeAlerts(
      [
        visit({
          id: 'v6',
          title: 'OGTT visit',
          due_from: '2026-03-04',
          due_to: '2026-03-18',
          recommended_tests: ['OGTT'],
        }),
      ],
      today,
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      kind: 'visit_due',
      visitId: 'v6',
      title: 'OGTT visit',
      tests: ['OGTT'],
    });
  });

  it('ignores booked, completed, future and long-past visits', () => {
    const a = homeAlerts(
      [
        visit({
          id: 'booked',
          status: 'scheduled',
          appointment_id: 'a1',
          due_from: '2026-03-04',
          due_to: '2026-03-18',
        }),
        visit({ id: 'done', status: 'completed', due_from: '2026-03-04', due_to: '2026-03-18' }),
        visit({ id: 'future', due_from: '2026-04-01', due_to: '2026-04-14' }),
        visit({ id: 'ancient', due_from: '2025-12-01', due_to: '2025-12-14' }),
      ],
      today,
    );
    expect(a).toEqual([]);
  });

  it('flags a recently closed window as overdue and lists it first', () => {
    const a = homeAlerts(
      [
        visit({ id: 'open', seq: 2, due_from: '2026-03-01', due_to: '2026-03-20' }),
        visit({ id: 'late', seq: 1, due_from: '2026-02-20', due_to: '2026-03-05' }),
      ],
      today,
    );
    expect(a.map((x) => `${x.visitId}:${x.kind}`)).toEqual([
      'late:visit_overdue',
      'open:visit_due',
    ]);
  });

  it('caps the list', () => {
    const many = ['a', 'b', 'c', 'd'].map((id, i) =>
      visit({ id, seq: i, due_from: '2026-03-01', due_to: `2026-03-${20 + i}` }),
    );
    expect(homeAlerts(many, today, 3)).toHaveLength(3);
  });
});
