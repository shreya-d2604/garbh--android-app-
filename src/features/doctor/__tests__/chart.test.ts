import { buildTimeline, groupPrescriptions, labSeries, vitalSeries } from '../chart';
import type { PrescriptionItemRow } from '../types';

describe('timeline', () => {
  it('merges consultations, reports and visits that happened, newest first', () => {
    const entries = buildTimeline(
      [
        { id: 'v1', title: 'Anomaly scan', status: 'completed', due_from: '2026-06-01', created_at: '2026-04-01T00:00:00Z' },
        { id: 'v2', title: 'Routine', status: 'planned', due_from: '2026-12-01', created_at: '2026-04-01T00:00:00Z' },
        { id: 'v3', title: 'Cancelled', status: 'cancelled', due_from: '2026-07-01', created_at: '2026-04-01T00:00:00Z' },
        { id: 'v4', title: 'Booked', status: 'scheduled', due_from: '2026-10-05', created_at: '2026-04-01T00:00:00Z' },
      ],
      [{ id: 'c1', created_at: '2026-08-20T10:00:00Z', published_at: '2026-08-20T11:00:00Z', advice: 'Rest' }],
      [
        { id: 'r1', title: 'CBC', type: 'blood', report_date: '2026-08-19', created_at: '2026-08-21T00:00:00Z', deleted_at: null },
        { id: 'r2', title: 'Gone', type: 'blood', report_date: '2026-08-30', created_at: '2026-08-30T00:00:00Z', deleted_at: '2026-09-01T00:00:00Z' },
      ],
    );
    expect(entries.map((e) => `${e.kind}:${e.id}`)).toEqual(['visit:v4', 'consultation:c1', 'report:r1', 'visit:v1']);
    expect(entries.find((e) => e.id === 'c1')).toMatchObject({ status: 'published', published: true });
  });

  it('marks unpublished consultations as drafts', () => {
    const [entry] = buildTimeline([], [{ id: 'c', created_at: '2026-08-20T10:00:00Z', published_at: null, advice: null }], []);
    expect(entry).toMatchObject({ status: 'draft', published: false, title: '' });
  });
});

describe('vital trends', () => {
  const c = (created_at: string, ga_weeks: number | null, over: object = {}) => ({
    created_at,
    ga_weeks,
    weight_kg: null,
    bp_systolic: null,
    bp_diastolic: null,
    pulse: null,
    fundal_height_cm: null,
    fetal_heart_rate: null,
    ...over,
  });

  it('builds oldest-first series and skips visits that did not record a value', () => {
    const series = vitalSeries([
      c('2026-09-01T00:00:00Z', 24, { weight_kg: 60, bp_systolic: 120, bp_diastolic: 80 }),
      c('2026-07-01T00:00:00Z', 16, { weight_kg: 56.5, bp_systolic: 110 }),
      c('2026-08-01T00:00:00Z', null, { pulse: 80 }),
    ]);
    expect(series.weight_kg.map((p) => [p.label, p.value])).toEqual([['16w', 56.5], ['24w', 60]]);
    expect(series.bp_systolic.map((p) => p.value)).toEqual([110, 120]);
    expect(series.bp_diastolic.map((p) => p.value)).toEqual([80]);
    expect(series.pulse).toEqual([{ label: '08-01', value: 80, date: '2026-08-01T00:00:00Z' }]);
    expect(series.fundal_height_cm).toEqual([]);
  });

  it('uses verified numeric lab values only', () => {
    const r = (over: object) => ({ test_code: 'HB', value_num: 10, verified: true, observed_on: '2026-08-01', created_at: '2026-08-02T00:00:00Z', ...over });
    const series = labSeries(
      [r({ value_num: 10.4, observed_on: '2026-08-20' }), r({ value_num: 11.2, observed_on: '2026-07-20' }), r({ verified: false }), r({ test_code: 'TSH' }), r({ value_num: null })],
      'HB',
    );
    expect(series.map((p) => p.value)).toEqual([11.2, 10.4]);
    expect(series[0]?.label).toBe('07-20');
  });
});

describe('prescription history', () => {
  it('groups by consultation, newest first, dropping consultations without rows', () => {
    const item = (id: string, consultation_id: string) => ({ id, consultation_id }) as PrescriptionItemRow;
    const groups = groupPrescriptions(
      [item('1', 'a'), item('2', 'b'), item('3', 'b')],
      [
        { id: 'a', created_at: '2026-07-01T00:00:00Z', published_at: null },
        { id: 'b', created_at: '2026-08-01T00:00:00Z', published_at: '2026-08-01T01:00:00Z' },
        { id: 'c', created_at: '2026-09-01T00:00:00Z', published_at: null },
      ],
    );
    expect(groups.map((g) => [g.consultationId, g.items.length, g.published])).toEqual([['b', 2, true], ['a', 1, false]]);
  });
});
