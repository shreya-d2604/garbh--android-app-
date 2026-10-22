import {
  ageInYears,
  formatGa,
  formatGpal,
  gaFromEdd,
  joinList,
  parseList,
  textOrNull,
} from '../format';

describe('format helpers', () => {
  it('formats gestational age', () => {
    expect(formatGa({ weeks: 24, days: 3 })).toBe('24w 3d');
  });

  it('computes GA from the due date and returns null without one', () => {
    // EDD 2027-01-10 -> day 0 = 2026-04-05; 2026-09-20 is 168 days later = 24w 0d
    const ga = gaFromEdd('2027-01-10', '2026-09-20');
    expect(ga).toMatchObject({ weeks: 24, days: 0, trimester: 2 });
    expect(gaFromEdd(null, '2026-09-20')).toBeNull();
    expect(gaFromEdd('not-a-date', '2026-09-20')).toBeNull();
  });

  it('computes age in whole years around the birthday', () => {
    expect(ageInYears('1996-04-12', '2026-04-11')).toBe(29);
    expect(ageInYears('1996-04-12', '2026-04-12')).toBe(30);
    expect(ageInYears(null, '2026-04-12')).toBeNull();
    expect(ageInYears('2030-01-01', '2026-04-12')).toBeNull();
  });

  it('formats G/P/A/L with dashes for unknowns', () => {
    expect(formatGpal({ gravida: 2, para: 1, abortus: 0, living: 1 })).toBe('G2 P1 A0 L1');
    expect(formatGpal({ gravida: null, para: null, abortus: null, living: null })).toBe(
      'G- P- A- L-',
    );
  });

  it('parses comma/newline lists without blanks or duplicates', () => {
    expect(parseList(' Penicillin, sulfa ,\nPENICILLIN,, ')).toEqual(['Penicillin', 'sulfa']);
    expect(parseList('')).toEqual([]);
    expect(parseList(null)).toEqual([]);
    expect(joinList(['a', 'b'])).toBe('a, b');
    expect(joinList(null)).toBe('');
  });

  it('turns blank text into null', () => {
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull(' hi ')).toBe('hi');
    expect(textOrNull(undefined)).toBeNull();
  });
});
