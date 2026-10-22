import {
  outcomeSchema,
  pregnancyDefaults,
  pregnancyFormSchema,
  previewEdd,
  toMedicalPatch,
  toPregnancyPatch,
  type PregnancyFormValues,
} from '../pregnancy-form';

const TODAY = '2026-09-20';

const defaults = pregnancyDefaults(
  {
    lmp_date: '2026-04-05',
    edd_usg: null,
    lmp_source: 'patient_reported',
    risk_level: 'low',
    risk_factors: ['Anaemia'],
    gravida: 2,
    para: 1,
    abortus: 0,
    living: 1,
    multiple_gestation: 1,
  },
  { blood_group: 'O+', rh_negative: false, allergies: ['Penicillin'], chronic_conditions: [] },
);

const issues = (v: PregnancyFormValues) => {
  const r = pregnancyFormSchema(TODAY).safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
};

describe('pregnancy management form', () => {
  it('starts from the saved values; patient-reported dates are not yet confirmed', () => {
    expect(defaults).toMatchObject({
      lmp_date: '2026-04-05',
      edd_usg: '',
      confirmed: false,
      risk_factors: 'Anaemia',
      gravida: '2',
      blood_group: 'O+',
      allergies: 'Penicillin',
    });
    expect(issues(defaults)).toEqual([]);
  });

  it('needs at least one date and rejects impossible ones', () => {
    expect(issues({ ...defaults, lmp_date: '' })).toEqual(['lmp_date:doctor:validation.needDates']);
    expect(issues({ ...defaults, lmp_date: '2026-09-21' })).toEqual(['lmp_date:doctor:validation.lmpFuture']);
    expect(issues({ ...defaults, lmp_date: '2025-01-01' })).toEqual(['lmp_date:doctor:validation.lmpOld']);
    expect(issues({ ...defaults, lmp_date: '', edd_usg: '2027-01-10' })).toEqual([]);
    expect(issues({ ...defaults, edd_usg: '2028-01-10' })).toEqual(['edd_usg:doctor:validation.eddRange']);
  });

  it('validates the obstetric counts and the number of babies', () => {
    expect(issues({ ...defaults, gravida: '25' })).toEqual(['gravida:doctor:validation.count']);
    expect(issues({ ...defaults, para: 'x' })).toEqual(['para:doctor:validation.count']);
    expect(issues({ ...defaults, gravida: '' })).toEqual([]);
    expect(issues({ ...defaults, multiple_gestation: '0' })).toEqual(['multiple_gestation:doctor:validation.multiple']);
    expect(issues({ ...defaults, multiple_gestation: '2' })).toEqual([]);
  });

  it('only accepts known blood groups', () => {
    expect(issues({ ...defaults, blood_group: 'Z+' })).toEqual(['blood_group:validation.required']);
    expect(issues({ ...defaults, blood_group: '' })).toEqual([]);
  });

  it('marks dates as clinician-confirmed when changed or confirmed, otherwise leaves the source alone', () => {
    expect(toPregnancyPatch(defaults, defaults)).not.toHaveProperty('lmp_source');
    expect(toPregnancyPatch({ ...defaults, confirmed: true }, defaults).lmp_source).toBe('clinician');
    expect(toPregnancyPatch({ ...defaults, edd_usg: '2027-01-08' }, defaults)).toMatchObject({
      edd_usg: '2027-01-08',
      lmp_source: 'clinician',
    });
  });

  it('builds the patch with numbers, lists and nulls', () => {
    expect(
      toPregnancyPatch({ ...defaults, gravida: '', risk_level: 'high', risk_factors: 'GDM, Age > 35, gdm' }, defaults),
    ).toMatchObject({ gravida: null, para: 1, risk_level: 'high', risk_factors: ['GDM', 'Age > 35'], multiple_gestation: 1 });
    expect(toMedicalPatch({ ...defaults, blood_group: '', allergies: 'a, b', rh_negative: true })).toEqual({
      blood_group: null,
      rh_negative: true,
      allergies: ['a', 'b'],
      chronic_conditions: [],
    });
  });

  it('previews the due date: scan date wins over LMP + 280', () => {
    expect(previewEdd({ lmp_date: '2026-04-05', edd_usg: '' })).toBe('2027-01-10');
    expect(previewEdd({ lmp_date: '2026-04-05', edd_usg: '2027-01-02' })).toBe('2027-01-02');
    expect(previewEdd({ lmp_date: '', edd_usg: '' })).toBeNull();
  });

  it('closing a pregnancy needs an outcome and a date that is not in the future', () => {
    const ok = outcomeSchema(TODAY).safeParse({ status: 'delivered', outcome_date: '2026-09-20', outcome_notes: '' });
    expect(ok.success).toBe(true);
    expect(outcomeSchema(TODAY).safeParse({ status: 'delivered', outcome_date: '2026-09-21', outcome_notes: '' }).success).toBe(false);
    expect(outcomeSchema(TODAY).safeParse({ status: 'active', outcome_date: '2026-09-20', outcome_notes: '' }).success).toBe(false);
  });
});
