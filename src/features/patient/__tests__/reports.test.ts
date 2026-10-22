import {
  buildTrends,
  groupReportsByTrimester,
  hasAnyTrend,
  isDoctorReviewed,
  labFlag,
  referenceRange,
  trimesterOn,
} from '../reports';
import { consultation, lab, report } from '../test-fixtures';

const EDD = '2026-12-01'; // day 0 = 2026-02-24; week 14 starts 2026-06-03, week 28 starts 2026-09-09

describe('groupReportsByTrimester', () => {
  it('groups by the trimester of the report date, newest first', () => {
    const groups = groupReportsByTrimester(
      [
        report({ id: 't1', report_date: '2026-04-01' }),
        report({ id: 't3a', report_date: '2026-09-20' }),
        report({ id: 't3b', report_date: '2026-10-05' }),
        report({ id: 't2', report_date: '2026-07-01' }),
      ],
      EDD,
    );
    expect(groups.map((g) => g.trimester)).toEqual([3, 2, 1]);
    expect(groups[0]?.reports.map((r) => r.id)).toEqual(['t3b', 't3a']);
  });

  it('puts reports into an "unknown" group when there is no EDD', () => {
    const groups = groupReportsByTrimester([report()], null);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.trimester).toBe(0);
  });

  it('uses the upload day when a report has no report date', () => {
    expect(trimesterOn(EDD, '2026-10-01')).toBe(3);
    const groups = groupReportsByTrimester(
      [report({ report_date: null, created_at: new Date(2026, 6, 1, 12).toISOString() })],
      EDD,
    );
    expect(groups[0]?.trimester).toBe(2);
  });
});

describe('isDoctorReviewed', () => {
  it('is true when the doctor verified the report or approved a summary of it', () => {
    expect(isDoctorReviewed(report({ verified_at: '2026-09-24T00:00:00Z' }), [])).toBe(true);
    expect(
      isDoctorReviewed(report({ id: 'r1' }), [{ source_type: 'report', source_id: 'r1' }]),
    ).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isDoctorReviewed(report({ id: 'r1' }), [])).toBe(false);
    expect(
      isDoctorReviewed(report({ id: 'r1' }), [{ source_type: 'consultation', source_id: 'r1' }]),
    ).toBe(false);
    expect(
      isDoctorReviewed(report({ id: 'r1' }), [{ source_type: 'report', source_id: 'other' }]),
    ).toBe(false);
  });
});

describe('labFlag / referenceRange', () => {
  it('uses the stored flag when it is a known one', () => {
    expect(labFlag(lab({ flag: 'low' }))).toBe('low');
    expect(labFlag(lab({ flag: 'abnormal' }))).toBe('abnormal');
  });
  it('works the flag out from the reference range otherwise', () => {
    expect(labFlag(lab({ flag: null, value_num: 9, ref_low: 11, ref_high: 15 }))).toBe('low');
    expect(labFlag(lab({ flag: null, value_num: 16, ref_low: 11, ref_high: 15 }))).toBe('high');
    expect(labFlag(lab({ flag: null, value_num: 12, ref_low: 11, ref_high: 15 }))).toBe('normal');
    expect(labFlag(lab({ flag: null, value_num: 12, ref_low: null, ref_high: null }))).toBeNull();
    expect(labFlag(lab({ flag: null, value_num: null }))).toBeNull();
  });
  it('describes the range', () => {
    expect(referenceRange(lab({ ref_low: 11, ref_high: 15 }))).toEqual({
      kind: 'between',
      low: 11,
      high: 15,
    });
    expect(referenceRange(lab({ ref_low: null, ref_high: 120 }))).toEqual({
      kind: 'upTo',
      high: 120,
    });
    expect(referenceRange(lab({ ref_low: 11, ref_high: null }))).toEqual({ kind: 'from', low: 11 });
    expect(referenceRange(lab({ ref_low: null, ref_high: null }))).toBeNull();
  });
});

describe('buildTrends', () => {
  it('only uses verified lab values and published consultations', () => {
    const t = buildTrends(
      [
        lab({ id: '1', test_code: 'HB', value_num: 10.4, observed_on: '2026-09-23' }),
        lab({
          id: '2',
          test_code: 'HB',
          value_num: 12,
          verified: false,
          observed_on: '2026-09-30',
        }),
        lab({ id: '3', test_code: 'HB', value_num: 11.2, observed_on: '2026-08-01' }),
        lab({ id: '4', test_code: 'FBS', value_num: 88, observed_on: '2026-09-23' }),
        lab({ id: '5', test_code: 'PPBS', value_num: 130, observed_on: '2026-09-23' }),
        lab({ id: '6', test_code: 'TSH', value_num: 2 }),
        lab({ id: '7', test_code: 'HB', value_num: null, value_text: 'low' }),
      ],
      [
        consultation({
          id: 'c1',
          published_at: '2026-09-24T05:30:00.000Z',
          ga_weeks: 29,
          weight_kg: 60,
          bp_systolic: 112,
          bp_diastolic: 72,
        }),
        consultation({
          id: 'c2',
          published_at: null,
          weight_kg: 99,
          bp_systolic: 180,
          bp_diastolic: 100,
        }),
        consultation({
          id: 'c3',
          published_at: '2026-08-20T05:30:00.000Z',
          ga_weeks: 25,
          weight_kg: 58,
          bp_systolic: null,
          bp_diastolic: null,
        }),
      ],
      EDD,
    );
    expect(t.hb.map((p) => p.value)).toEqual([11.2, 10.4]); // ordered by date, unverified dropped
    expect(t.hb.map((p) => p.label)).toEqual(['22w', '30w']);
    expect(t.weight.map((p) => [p.label, p.value])).toEqual([
      ['25w', 58],
      ['29w', 60],
    ]);
    expect(t.systolic.map((p) => p.value)).toEqual([112]);
    expect(t.diastolic.map((p) => p.value)).toEqual([72]);
    expect(t.fastingSugar.map((p) => p.value)).toEqual([88]);
    expect(t.postMealSugar.map((p) => p.value)).toEqual([130]);
    expect(hasAnyTrend(t)).toBe(true);
  });

  it('reports no data when nothing qualifies', () => {
    const t = buildTrends([lab({ verified: false })], [consultation({ published_at: null })], EDD);
    expect(hasAnyTrend(t)).toBe(false);
  });
});
