import {
  DQ_RULES,
  describeImplausible,
  dqDetailParams,
  dqFixRoute,
  implausibleVitals,
  isDqRule,
  mergeCounts,
  toIssue,
} from '../data-quality';

describe('mergeCounts', () => {
  it('returns every rule, with problems first, high severity first', () => {
    const merged = mergeCounts([
      { rule: 'no_app_account', severity: 'low', issue_count: 5 },
      { rule: 'ga_over_42', severity: 'high', issue_count: 1 },
      { rule: 'past_booked', severity: 'medium', issue_count: 2 },
    ]);
    expect(merged).toHaveLength(DQ_RULES.length);
    expect(merged.slice(0, 3).map((m) => m.rule)).toEqual([
      'ga_over_42',
      'past_booked',
      'no_app_account',
    ]);
    expect(merged.slice(3).every((m) => m.count === 0)).toBe(true);
  });

  it('an empty result means every rule is clear', () => {
    const merged = mergeCounts([]);
    expect(merged.every((m) => m.count === 0)).toBe(true);
    expect(merged.find((m) => m.rule === 'no_edd')?.severity).toBe('high');
  });

  it('ignores rules this app does not know', () => {
    expect(
      mergeCounts([{ rule: 'brand_new_rule', severity: 'high', issue_count: 9 }]).every(
        (m) => m.count === 0,
      ),
    ).toBe(true);
  });
});

describe('dqFixRoute: every issue links to a fix screen', () => {
  const ids = { patientId: 'pt', pregnancyId: 'pr', entityId: 'en' };
  const route = (rule: (typeof DQ_RULES)[number], over = {}) =>
    dqFixRoute({ rule, ...ids, ...over });

  it('date problems open the pregnancy', () => {
    expect(route('no_edd')).toBe('/admin/patients/pt/pregnancy/pr');
    expect(route('ga_over_42')).toBe('/admin/patients/pt/pregnancy/pr');
  });

  it('care-team problems open the care team', () => {
    for (const rule of ['no_primary', 'primary_inactive', 't3_no_backup'] as const) {
      expect(route(rule)).toBe('/admin/patients/pt/pregnancy/pr/care-team');
    }
  });

  it('patient-level problems open the patient', () => {
    expect(route('unverified_14d')).toBe('/admin/patients/pt');
    expect(route('no_app_account')).toBe('/admin/patients/pt');
  });

  it('record-level problems open the item fix screen', () => {
    for (const rule of [
      'past_booked',
      'consult_unpublished',
      'lab_unverified_48h',
      'ai_draft_24h',
      'implausible_values',
    ] as const) {
      expect(route(rule)).toBe(`/admin/data-quality/item/${rule}/en`);
    }
  });

  it('falls back to the pregnancy or patient when ids are missing', () => {
    expect(route('lab_unverified_48h', { entityId: null })).toBe('/admin/patients/pt/pregnancy/pr');
    expect(route('no_primary', { pregnancyId: null })).toBe('/admin/patients/pt');
    expect(route('no_edd', { patientId: null })).toBe('/admin/patients');
  });
});

describe('details', () => {
  it('toIssue drops unknown rules and defaults odd values', () => {
    expect(
      toIssue({
        rule: 'nope',
        severity: 'high',
        patient_id: null,
        pregnancy_id: null,
        entity_id: null,
        patient_name: null,
        detail: {},
        since: null,
      }),
    ).toBeNull();
    const i = toIssue({
      rule: 'no_edd',
      severity: 'weird',
      patient_id: 'p',
      pregnancy_id: 'q',
      entity_id: 'q',
      patient_name: null,
      detail: [],
      since: null,
    });
    expect(i).toMatchObject({ rule: 'no_edd', severity: 'medium', patientName: '', detail: {} });
    expect(isDqRule('no_edd')).toBe(true);
    expect(isDqRule('x')).toBe(false);
  });

  it('interpolation values per rule', () => {
    expect(dqDetailParams({ rule: 'ga_over_42', detail: { weeks: 43, days: 2 } })).toEqual({
      weeks: 43,
      days: 2,
    });
    expect(dqDetailParams({ rule: 'lab_unverified_48h', detail: { count: 3 } })).toEqual({
      count: 3,
    });
    expect(dqDetailParams({ rule: 'unverified_14d', detail: { days: 20 } })).toEqual({ days: 20 });
    expect(dqDetailParams({ rule: 'no_primary', detail: {} })).toEqual({});
  });

  it('describes the offending values', () => {
    expect(describeImplausible({ bp: { systolic: 300, diastolic: 20 }, pulse: 400 })).toBe(
      'BP 300/20, Pulse 400',
    );
    expect(
      dqDetailParams({ rule: 'implausible_values', detail: { test: 'HB', value: -2 } }),
    ).toEqual({ values: 'Test HB, Value -2' });
  });
});

describe('implausibleVitals', () => {
  it('flags BP 300/20 and leaves normal values alone', () => {
    expect(implausibleVitals({ bp_systolic: '300', bp_diastolic: '20' }).sort()).toEqual([
      'bp_diastolic',
      'bp_systolic',
    ]);
    expect(
      implausibleVitals({
        bp_systolic: '120',
        bp_diastolic: '80',
        pulse: '84',
        temperature: '36.8',
      }),
    ).toEqual([]);
  });

  it('flags systolic not above diastolic, blanks are ignored', () => {
    expect(implausibleVitals({ bp_systolic: '80', bp_diastolic: '90' }).sort()).toEqual([
      'bp_diastolic',
      'bp_systolic',
    ]);
    expect(implausibleVitals({ bp_systolic: '', pulse: ' ' })).toEqual([]);
  });

  it('flags other vitals out of range', () => {
    expect(implausibleVitals({ pulse: '400', temperature: '98.6', spo2: '50' }).sort()).toEqual([
      'pulse',
      'spo2',
      'temperature',
    ]);
  });
});
