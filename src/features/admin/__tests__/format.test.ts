import {
  blankToNull,
  formatDay,
  formatWhen,
  gaLabel,
  joinList,
  percent,
  sanitizeSearch,
  searchFilter,
  shapeMetrics,
  splitList,
  type DashboardRow,
} from '../format';

const row = (over: Partial<DashboardRow> = {}): DashboardRow => ({
  active_pregnancies: 10,
  trimester_1: 3,
  trimester_2: 4,
  trimester_3: 2,
  high_risk: 1,
  appointments_today: 5,
  appointments_week: 18,
  no_show_rate: 0.1234,
  no_show_sample: 40,
  ai_pending: 2,
  unverified_values: 7,
  missed_visits: 0,
  unverified_patients: 3,
  open_issues: 12,
  ...over,
});

describe('shapeMetrics', () => {
  it('shapes trimesters, undated pregnancies and the no-show percentage', () => {
    const v = shapeMetrics(row());
    expect(v.trimesters).toEqual([
      { trimester: 1, count: 3 },
      { trimester: 2, count: 4 },
      { trimester: 3, count: 2 },
    ]);
    expect(v.undated).toBe(1);
    expect(v.noShow).toEqual({ percent: '12%', sample: 40 });
    expect(v.appointmentsToday).toBe(5);
    expect(v.allClear).toBe(false);
  });

  it('sorts attention items by count and links the actionable ones', () => {
    const v = shapeMetrics(row());
    expect(v.attention.map((a) => a.key)).toEqual([
      'openIssues',
      'unverifiedValues',
      'unverifiedPatients',
      'aiPending',
      'missedVisits',
    ]);
    expect(v.attention[0]?.route).toBe('/admin/data-quality');
    expect(v.attention.find((a) => a.key === 'unverifiedPatients')?.route).toBe(
      '/admin/patients?filter=unverified',
    );
    expect(v.attention.find((a) => a.key === 'aiPending')?.route).toBeUndefined();
  });

  it('reports no no-show rate without data and "all clear" when nothing needs attention', () => {
    const v = shapeMetrics(
      row({
        no_show_rate: null,
        no_show_sample: 0,
        ai_pending: 0,
        unverified_values: 0,
        missed_visits: 0,
        unverified_patients: 0,
        open_issues: 0,
      }),
    );
    expect(v.noShow.percent).toBeNull();
    expect(v.allClear).toBe(true);
  });

  it('never reports a negative undated count', () => {
    expect(shapeMetrics(row({ active_pregnancies: 2 })).undated).toBe(0);
  });
});

describe('helpers', () => {
  it('gaLabel gives weeks and days, or null without an EDD', () => {
    // EDD 2027-01-01 -> day 0 = 2026-03-27; on 2026-10-22 that is 209 days = 29w6d
    expect(gaLabel('2027-01-01', '2026-10-22')).toBe('29w6d');
    expect(gaLabel(null, '2026-10-22')).toBeNull();
    expect(gaLabel('garbage', '2026-10-22')).toBeNull();
  });

  it('percent rounds and tolerates missing values', () => {
    expect(percent(0)).toBe('0%');
    expect(percent(0.5)).toBe('50%');
    expect(percent(null)).toBeNull();
    expect(percent(Number.NaN)).toBeNull();
  });

  it('sanitizeSearch removes characters that would change a PostgREST filter', () => {
    expect(sanitizeSearch('  Priya, (Sharma)*  ')).toBe('Priya Sharma');
    expect(sanitizeSearch('a%b:c"d\\e')).toBe('a b c d e');
    expect(sanitizeSearch(' ,() ')).toBe('');
  });

  it('searchFilter builds an or() clause or null', () => {
    expect(searchFilter(['full_name', 'mrn'], 'GH-00')).toBe(
      'full_name.ilike.%GH-00%,mrn.ilike.%GH-00%',
    );
    expect(searchFilter(['full_name'], ' , ')).toBeNull();
  });

  it('list helpers round-trip', () => {
    expect(splitList(' a, b ,,c\nd ')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitList(undefined)).toEqual([]);
    expect(joinList(['x', 'y'])).toBe('x, y');
    expect(joinList(null)).toBe('');
    expect(blankToNull('  ')).toBeNull();
    expect(blankToNull(' hi ')).toBe('hi');
  });
});

describe('date display', () => {
  it('formats timestamps and calendar dates, tolerating bad input', () => {
    expect(formatDay('2026-10-05')).toBe('5 Oct 2026');
    expect(formatDay(new Date(2026, 9, 5, 16, 30).toISOString())).toBe('5 Oct 2026');
    expect(formatWhen(new Date(2026, 9, 5, 16, 30).toISOString())).toBe('5 Oct 2026, 4:30 PM');
    expect(formatWhen(null)).toBe('');
    expect(formatWhen('nope')).toBe('');
    expect(formatDay('')).toBe('');
  });
});
