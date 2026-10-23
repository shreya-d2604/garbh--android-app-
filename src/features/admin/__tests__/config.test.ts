import {
  CONFIG_TABLES,
  SINGLE_CONFIGS,
  buildPayload,
  buildTablePayload,
  isConfigKey,
  isSingleConfigKey,
  isTrimesterRef,
  valuesFromRow,
} from '../config';

describe('lab tests', () => {
  const def = CONFIG_TABLES.lab_tests;
  const base = {
    code: ' tsh ',
    name: 'Thyroid stimulating hormone',
    unit: 'mIU/L',
    ref_low: '0.1',
    ref_high: '3.0',
    trimester_ref: '',
    is_active: true,
  };

  it('upper-cases the code and parses numbers', () => {
    const r = buildTablePayload(def, base, false);
    expect(r).toEqual({
      ok: true,
      payload: {
        code: 'TSH',
        name: 'Thyroid stimulating hormone',
        unit: 'mIU/L',
        ref_low: 0.1,
        ref_high: 3,
        trimester_ref: null,
        is_active: true,
      },
    });
  });

  it('rejects a bad code, an inverted range and malformed trimester ranges', () => {
    expect(buildTablePayload(def, { ...base, code: 'T S H' }, false)).toMatchObject({
      ok: false,
      errors: { code: 'admin:validation.code' },
    });
    expect(buildTablePayload(def, { ...base, ref_low: '5', ref_high: '1' }, false)).toMatchObject({
      ok: false,
      errors: { ref_high: 'admin:validation.rangeOrder' },
    });
    expect(
      buildTablePayload(def, { ...base, trimester_ref: '{"4":{"low":1}}' }, false),
    ).toMatchObject({ ok: false, errors: { trimester_ref: 'admin:validation.json' } });
    expect(buildTablePayload(def, { ...base, trimester_ref: 'not json' }, false)).toMatchObject({
      ok: false,
    });
    const good = buildTablePayload(
      def,
      { ...base, trimester_ref: '{"1":{"low":0.1,"high":2.5}}' },
      false,
    );
    expect(good.ok && good.payload.trimester_ref).toEqual({ '1': { low: 0.1, high: 2.5 } });
  });

  it('leaves the primary key out when editing', () => {
    const r = buildTablePayload(def, { ...base, code: '' }, true);
    expect(r.ok && 'code' in r.payload).toBe(false);
  });

  it('validates the trimester shape', () => {
    expect(isTrimesterRef({ '1': { low: 1, high: 2 }, '3': { high: 4 } })).toBe(true);
    expect(isTrimesterRef({ '1': { low: '1' } })).toBe(false);
    expect(isTrimesterRef({ '1': { extra: 1 } })).toBe(false);
    expect(isTrimesterRef([])).toBe(false);
    expect(isTrimesterRef(null)).toBe(false);
  });
});

describe('visit templates', () => {
  const def = CONFIG_TABLES.visit_templates;
  const base = {
    schedule: 'standard',
    seq: '3',
    title: 'Routine visit',
    target_week: '16',
    window_start_week: '15',
    window_end_week: '17',
    purpose: '',
    recommended_tests: 'Urine, Quadruple marker',
    is_active: true,
  };

  it('builds numbers and a test list', () => {
    const r = buildTablePayload(def, base, false);
    expect(r).toMatchObject({
      ok: true,
      payload: {
        seq: 3,
        target_week: 16,
        recommended_tests: ['Urine', 'Quadruple marker'],
        purpose: null,
      },
    });
  });

  it('enforces window <= target <= window end and week ranges', () => {
    expect(buildTablePayload(def, { ...base, window_start_week: '18' }, false)).toMatchObject({
      ok: false,
      errors: { window_start_week: 'admin:validation.windowOrder' },
    });
    expect(buildTablePayload(def, { ...base, window_end_week: '15' }, false)).toMatchObject({
      ok: false,
      errors: { window_end_week: 'admin:validation.windowOrder' },
    });
    expect(buildTablePayload(def, { ...base, target_week: '50' }, false)).toMatchObject({
      ok: false,
      errors: { target_week: 'admin:validation.integer' },
    });
    expect(buildTablePayload(def, { ...base, seq: '1.5' }, false)).toMatchObject({
      ok: false,
      errors: { seq: 'admin:validation.integer' },
    });
  });

  it('requires the title and a valid schedule', () => {
    expect(buildTablePayload(def, { ...base, title: ' ' }, false)).toMatchObject({
      ok: false,
      errors: { title: 'common:validation.required' },
    });
    expect(buildTablePayload(def, { ...base, schedule: 'weekly' }, false)).toMatchObject({
      ok: false,
      errors: { schedule: 'admin:validation.choice' },
    });
  });
});

describe('other catalogs', () => {
  it('curated guidance: trimester is optional and numeric', () => {
    const def = CONFIG_TABLES.curated_guidance;
    const base = {
      kind: 'warning_sign',
      text: 'Baby moving less',
      reason: '',
      trimester: '',
      condition: ' GDM ',
      is_active: true,
    };
    expect(buildTablePayload(def, base, false)).toMatchObject({
      ok: true,
      payload: { trimester: null, condition: 'gdm', reason: null },
    });
    expect(buildTablePayload(def, { ...base, trimester: '3' }, false)).toMatchObject({
      ok: true,
      payload: { trimester: 3 },
    });
    expect(buildTablePayload(def, { ...base, trimester: '4' }, false)).toMatchObject({ ok: false });
  });

  it('milestones: weeks in order, snake_case key', () => {
    const def = CONFIG_TABLES.milestones;
    const base = {
      key: 'NT_scan',
      title: 'NT scan',
      category: 'scan',
      week_from: '11',
      week_to: '13',
      description: '',
    };
    expect(buildTablePayload(def, base, false)).toMatchObject({
      ok: true,
      payload: { key: 'nt_scan', week_from: 11 },
    });
    expect(buildTablePayload(def, { ...base, week_to: '10' }, false)).toMatchObject({
      ok: false,
      errors: { week_to: 'admin:validation.windowOrder' },
    });
    expect(buildTablePayload(def, { ...base, key: 'nt scan' }, false)).toMatchObject({
      ok: false,
      errors: { key: 'admin:validation.code' },
    });
  });

  it('week content: week 4-42 and decimals', () => {
    const def = CONFIG_TABLES.week_content;
    const base = {
      week: '20',
      baby_size_label: 'Banana',
      baby_length_cm: '25.6',
      baby_weight_g: '300',
      baby_development: '',
      mother_changes: '',
      tips: '',
    };
    expect(buildTablePayload(def, base, false)).toMatchObject({
      ok: true,
      payload: { week: 20, baby_length_cm: 25.6 },
    });
    expect(buildTablePayload(def, { ...base, week: '3' }, false)).toMatchObject({ ok: false });
    expect(buildTablePayload(def, { ...base, baby_length_cm: '12,5' }, false)).toMatchObject({
      ok: false,
    });
  });

  it('drug catalog: name required', () => {
    const def = CONFIG_TABLES.drug_catalog;
    expect(
      buildTablePayload(
        def,
        {
          name: '',
          generic: '',
          common_strengths: '5 mg, 10 mg',
          pregnancy_caution_note: '',
          is_active: true,
        },
        false,
      ),
    ).toMatchObject({ ok: false });
    expect(
      buildTablePayload(
        def,
        {
          name: 'Folic acid',
          generic: '',
          common_strengths: '5 mg, 10 mg',
          pregnancy_caution_note: '',
          is_active: false,
        },
        false,
      ),
    ).toMatchObject({
      ok: true,
      payload: { common_strengths: ['5 mg', '10 mg'], is_active: false },
    });
  });
});

describe('hospital settings groups', () => {
  it('booking rules are whole numbers within sane limits', () => {
    const f = SINGLE_CONFIGS.booking.fields;
    const ok = {
      min_lead_hours: '2',
      max_advance_days: '60',
      patient_cancel_cutoff_hours: '4',
      unverified_max_upcoming: '1',
      verified_max_upcoming: '3',
    };
    expect(buildPayload(f, ok)).toEqual({
      ok: true,
      payload: {
        min_lead_hours: 2,
        max_advance_days: 60,
        patient_cancel_cutoff_hours: 4,
        unverified_max_upcoming: 1,
        verified_max_upcoming: 3,
      },
    });
    expect(buildPayload(f, { ...ok, max_advance_days: '0' })).toMatchObject({
      ok: false,
      errors: { max_advance_days: 'admin:validation.integer' },
    });
    expect(buildPayload(f, { ...ok, min_lead_hours: '-1' })).toMatchObject({ ok: false });
    expect(buildPayload(f, { ...ok, verified_max_upcoming: '' })).toMatchObject({
      ok: false,
      errors: { verified_max_upcoming: 'common:validation.required' },
    });
  });

  it('hospital: timezone from the list, reminder hours as a list', () => {
    const f = SINGLE_CONFIGS.hospital.fields;
    const ok = {
      name: 'GARBH',
      address: '',
      phone: '',
      timezone: 'Asia/Kolkata',
      default_slot_minutes: '15',
      reminder_lead_hours: '24, 2',
    };
    expect(buildPayload(f, ok)).toMatchObject({
      ok: true,
      payload: { reminder_lead_hours: [24, 2], address: null },
    });
    expect(buildPayload(f, { ...ok, timezone: 'Mars/Olympus' })).toMatchObject({
      ok: false,
      errors: { timezone: 'admin:validation.choice' },
    });
    expect(buildPayload(f, { ...ok, reminder_lead_hours: '24, soon' })).toMatchObject({
      ok: false,
    });
  });
});

describe('valuesFromRow / keys', () => {
  it('turns a row into form strings and back', () => {
    const def = CONFIG_TABLES.lab_tests;
    const values = valuesFromRow(def.fields, {
      code: 'TSH',
      name: 'TSH',
      unit: null,
      ref_low: 0.1,
      ref_high: 3,
      is_active: false,
      trimester_ref: { '1': { low: 0.1, high: 2.5 } },
    });
    expect(values).toMatchObject({ code: 'TSH', unit: '', ref_low: '0.1', is_active: false });
    expect(String(values.trimester_ref)).toContain('"low": 0.1');
    const rebuilt = buildTablePayload(def, values, true);
    expect(rebuilt.ok && rebuilt.payload.trimester_ref).toEqual({ '1': { low: 0.1, high: 2.5 } });
  });

  it('new rows start active; lists and int lists are comma separated', () => {
    expect(valuesFromRow(CONFIG_TABLES.drug_catalog.fields).is_active).toBe(true);
    expect(
      valuesFromRow(CONFIG_TABLES.drug_catalog.fields, {
        common_strengths: ['a', 'b'],
        is_active: false,
      }).common_strengths,
    ).toBe('a, b');
    expect(
      valuesFromRow(SINGLE_CONFIGS.hospital.fields, { reminder_lead_hours: [24, 2] })
        .reminder_lead_hours,
    ).toBe('24, 2');
  });

  it('knows its keys', () => {
    expect(isConfigKey('lab_tests')).toBe(true);
    expect(isConfigKey('profiles')).toBe(false);
    expect(isSingleConfigKey('booking')).toBe(true);
    expect(isSingleConfigKey('x')).toBe(false);
  });

  it('describes rows for the lists', () => {
    expect(CONFIG_TABLES.visit_templates.titleOf({ seq: 2, title: 'NT scan' })).toBe('#2 NT scan');
    expect(
      CONFIG_TABLES.milestones.subtitleOf({ category: 'scan', week_from: 11, week_to: 13 }),
    ).toBe('scan · weeks 11-13');
    expect(
      CONFIG_TABLES.milestones.subtitleOf({ category: 'vaccine', week_from: 28, week_to: 28 }),
    ).toBe('vaccine · weeks 28');
  });
});
