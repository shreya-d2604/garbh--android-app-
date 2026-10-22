import {
  addDays,
  diffDays,
  eddFinal,
  eddFromLmp,
  gestationalAge,
  isISODate,
  isPostTerm,
  lmpFromEdd,
  progressToEdd,
  todayISO,
  visitWindow,
} from '../pregnancy-math';

// SAME vectors as supabase/tests/head_01_gestational_age.test.sql (SQL ga_from_edd).
const VECTORS: [
  edd: string,
  on: string,
  weeks: number,
  days: number,
  trimester: number,
  daysToEdd: number,
][] = [
  ['2027-02-08', '2026-10-22', 24, 3, 2, 109],
  ['2026-12-10', '2026-10-22', 33, 0, 3, 49],
  ['2026-07-01', '2025-09-24', 0, 0, 1, 280],
  ['2026-07-01', '2025-12-30', 13, 6, 1, 183],
  ['2026-07-01', '2025-12-31', 14, 0, 2, 182],
  ['2026-07-01', '2026-04-07', 27, 6, 2, 85],
  ['2026-07-01', '2026-04-08', 28, 0, 3, 84],
  ['2026-07-01', '2026-07-01', 40, 0, 3, 0],
  ['2026-07-01', '2026-07-15', 42, 0, 3, -14],
  ['2026-07-01', '2025-09-21', -1, 4, 1, 283],
  ['2024-02-29', '2023-06-01', 1, 0, 1, 273],
  ['2025-01-01', '2024-12-31', 39, 6, 3, 1],
];

describe('gestationalAge', () => {
  it.each(VECTORS)(
    'edd %s on %s -> %iw%id T%i, %i days to EDD',
    (edd, on, weeks, days, trimester, dte) => {
      expect(gestationalAge(edd, on)).toMatchObject({ weeks, days, trimester, daysToEdd: dte });
    },
  );

  it('agrees with a naive Date-based reference on 100 random dates', () => {
    let seed = 42;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 100; i++) {
      const edd = addDays('2026-01-01', Math.floor(rand() * 1500));
      const on = addDays(edd, -Math.floor(rand() * 320));
      const ga = gestationalAge(edd, on);
      const naiveDays =
        Math.round(
          (new Date(`${on}T12:00:00Z`).getTime() - new Date(`${edd}T12:00:00Z`).getTime()) /
            86_400_000,
        ) + 280;
      expect(ga.weeks * 7 + ga.days).toBe(naiveDays);
      expect(ga.days).toBeGreaterThanOrEqual(0);
      expect(ga.days).toBeLessThan(7);
    }
  });

  it('flags post-term from 41 weeks', () => {
    expect(isPostTerm(gestationalAge('2026-07-01', '2026-07-07'))).toBe(false);
    expect(isPostTerm(gestationalAge('2026-07-01', '2026-07-08'))).toBe(true);
  });

  it('clamps progress to 0..1', () => {
    expect(progressToEdd(gestationalAge('2026-07-01', '2025-09-01'))).toBe(0);
    expect(progressToEdd(gestationalAge('2026-07-01', '2026-02-11'))).toBeCloseTo(0.5, 2);
    expect(progressToEdd(gestationalAge('2026-07-01', '2026-08-01'))).toBe(1);
  });
});

describe('date helpers', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2023-02-29')).toBe(false);
    expect(isISODate('2024-2-1')).toBe(false);
  });

  it('applies Naegele and the dating-scan override', () => {
    expect(eddFromLmp('2026-01-01')).toBe('2026-10-08');
    expect(lmpFromEdd('2026-10-08')).toBe('2026-01-01');
    expect(eddFinal('2026-01-01', null)).toBe('2026-10-08');
    expect(eddFinal('2026-01-01', '2026-10-01')).toBe('2026-10-01');
    expect(eddFinal(null, null)).toBeNull();
  });

  it('computes visit windows like generate_visit_plan()', () => {
    const edd = eddFromLmp('2026-01-01');
    expect(visitWindow(edd, 11, 13)).toEqual({ dueFrom: '2026-03-19', dueTo: '2026-04-08' });
    expect(diffDays('2026-04-08', '2026-01-01')).toBe(13 * 7 + 6);
  });

  it('formats the local date', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
