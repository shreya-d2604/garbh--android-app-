import { frequencyHint, groupPrescriptions, isActiveOn, todaysMedicines } from '../medicines';
import { consultation, item } from '../test-fixtures';

const today = '2026-10-22';

describe("today's medicines filter", () => {
  it('includes an active item whose dates cover today (edges inclusive)', () => {
    expect(isActiveOn(item({ start_date: '2026-10-22', end_date: '2026-11-20' }), today)).toBe(
      true,
    );
    expect(isActiveOn(item({ start_date: '2026-09-24', end_date: '2026-10-22' }), today)).toBe(
      true,
    );
  });
  it('excludes items not started, finished or stopped', () => {
    expect(isActiveOn(item({ start_date: '2026-10-23' }), today)).toBe(false);
    expect(isActiveOn(item({ end_date: '2026-10-21' }), today)).toBe(false);
    expect(isActiveOn(item({ is_active: false }), today)).toBe(false);
    expect(isActiveOn(item({ stopped_at: '2026-10-01T00:00:00Z', is_active: null }), today)).toBe(
      false,
    );
  });
  it('treats missing dates as open-ended', () => {
    expect(isActiveOn(item({ start_date: null, end_date: null }), today)).toBe(true);
  });
  it('filters a list', () => {
    const list = [
      item({ id: 'a' }),
      item({ id: 'b', end_date: '2026-10-01' }),
      item({ id: 'c', is_active: false }),
    ];
    expect(todaysMedicines(list, today).map((i) => i.id)).toEqual(['a']);
  });
});

describe('frequencyHint', () => {
  it('reads morning-afternoon-night patterns', () => {
    expect(frequencyHint('1-0-1')).toEqual(['morning', 'night']);
    expect(frequencyHint('0-1-0')).toEqual(['afternoon']);
    expect(frequencyHint('1-1-1')).toEqual(['morning', 'afternoon', 'night']);
    expect(frequencyHint('1-1-1-1')).toEqual(['morning', 'afternoon', 'evening', 'night']);
  });
  it('returns null for anything else', () => {
    expect(frequencyHint('twice a day')).toBeNull();
    expect(frequencyHint('0-0-0')).toBeNull();
    expect(frequencyHint('1-0')).toBeNull();
    expect(frequencyHint(null)).toBeNull();
  });
});

describe('groupPrescriptions', () => {
  it('groups items under published consultations, newest first, dropping empty ones', () => {
    const older = consultation({
      id: 'c-old',
      published_at: '2026-08-01T05:00:00Z',
      advice: null,
      diet_advice: null,
    });
    const newer = consultation({ id: 'c-new', published_at: '2026-09-24T05:00:00Z' });
    const draft = consultation({ id: 'c-draft', published_at: null });
    const groups = groupPrescriptions(
      [older, newer, draft],
      [item({ id: 'i1', consultation_id: 'c-new' }), item({ id: 'i2', consultation_id: 'c-old' })],
    );
    expect(groups.map((g) => g.consultation.id)).toEqual(['c-new', 'c-old']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['i1']);
  });

  it('keeps a consultation with advice but no medicines', () => {
    const groups = groupPrescriptions([consultation({ id: 'c1' })], []);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toEqual([]);
  });
});
