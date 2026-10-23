import {
  buildExtraVisit,
  canDeleteVisit,
  extraVisitSchema,
  isEditable,
  shiftVisit,
  sortVisits,
  visitState,
} from '../visit-plan';

const issues = (values: object) => {
  const r = extraVisitSchema.safeParse(values);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
};

describe('extra visit form', () => {
  it('needs a week between 4 and 42 and a reason', () => {
    expect(issues({ week: '26', title: '', reason: 'High BP follow-up', tests: '' })).toEqual([]);
    expect(issues({ week: '3', title: '', reason: 'x1', tests: '' })).toEqual([
      'week:doctor:validation.week',
    ]);
    expect(issues({ week: '43', title: '', reason: 'x1', tests: '' })).toEqual([
      'week:doctor:validation.week',
    ]);
    expect(issues({ week: 'ab', title: '', reason: 'x1', tests: '' })).toEqual([
      'week:doctor:validation.week',
    ]);
    expect(issues({ week: '26', title: '', reason: ' ', tests: '' })).toEqual([
      'reason:validation.required',
    ]);
  });
});

describe('buildExtraVisit', () => {
  it('creates a planned extra visit whose window is the chosen week', () => {
    // EDD 2027-01-10 -> day 0 = 2026-04-05; week 26 starts 2026-10-04
    const v = buildExtraVisit({
      pregnancyId: 'p1',
      edd: '2027-01-10',
      addedBy: 'd1',
      existing: [{ seq: 12 }, { seq: 3 }],
      values: { week: '26', title: '', reason: ' High BP ', tests: 'BP, Urine, bp' },
      defaultTitle: 'Extra visit',
    });
    expect(v).toMatchObject({
      pregnancy_id: 'p1',
      seq: 13,
      target_week: 26,
      due_from: '2026-10-04',
      due_to: '2026-10-10',
      title: 'Extra visit',
      reason_added: 'High BP',
      recommended_tests: ['BP', 'Urine'],
      is_extra: true,
      added_by: 'd1',
      status: 'planned',
    });
  });

  it('keeps a custom title and numbers the first visit 1', () => {
    const v = buildExtraVisit({
      pregnancyId: 'p',
      edd: '2027-01-10',
      addedBy: 'd',
      existing: [],
      values: { week: '30', title: ' BP check ', reason: 'Why', tests: '' },
      defaultTitle: 'Extra visit',
    });
    expect(v.seq).toBe(1);
    expect(v.title).toBe('BP check');
  });
});

describe('visit ordering and state', () => {
  it('sorts by due date, then sequence, with undated visits last', () => {
    const sorted = sortVisits([
      { id: 'c', seq: 3, due_from: null },
      { id: 'b', seq: 2, due_from: '2026-10-01' },
      { id: 'a', seq: 5, due_from: '2026-09-01' },
      { id: 'd', seq: 1, due_from: '2026-10-01' },
    ]);
    expect(sorted.map((v) => v.id)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('derives the display state of a visit', () => {
    const today = '2026-09-20';
    expect(
      visitState({ status: 'completed', due_from: '2026-01-01', due_to: '2026-01-07' }, today),
    ).toBe('completed');
    expect(visitState({ status: 'scheduled', due_from: null, due_to: null }, today)).toBe(
      'scheduled',
    );
    expect(
      visitState({ status: 'planned', due_from: '2026-08-01', due_to: '2026-08-14' }, today),
    ).toBe('overdue');
    expect(
      visitState({ status: 'planned', due_from: '2026-09-15', due_to: '2026-09-25' }, today),
    ).toBe('due');
    expect(
      visitState({ status: 'planned', due_from: '2026-10-01', due_to: '2026-10-10' }, today),
    ).toBe('upcoming');
    expect(visitState({ status: 'skipped', due_from: null, due_to: null }, today)).toBe('skipped');
  });

  it('shifts a whole window by weeks and refuses to leave 4..42 weeks', () => {
    const visit = { target_week: 28, due_from: '2026-10-25', due_to: '2026-11-08' };
    expect(shiftVisit(visit, 1)).toEqual({
      target_week: 29,
      due_from: '2026-11-01',
      due_to: '2026-11-15',
    });
    expect(shiftVisit(visit, -2)).toEqual({
      target_week: 26,
      due_from: '2026-10-11',
      due_to: '2026-10-25',
    });
    expect(shiftVisit({ ...visit, target_week: 42 }, 1)).toBeNull();
    expect(shiftVisit({ ...visit, target_week: 4 }, -1)).toBeNull();
    expect(shiftVisit({ target_week: 20, due_from: null, due_to: null }, 1)).toBeNull();
  });

  it('only completed visits are locked; only extras can be deleted', () => {
    expect(isEditable({ status: 'completed' })).toBe(false);
    expect(isEditable({ status: 'planned' })).toBe(true);
    expect(canDeleteVisit({ status: 'planned', is_extra: true })).toBe(true);
    expect(canDeleteVisit({ status: 'planned', is_extra: false })).toBe(false);
    expect(canDeleteVisit({ status: 'completed', is_extra: true })).toBe(false);
  });
});
