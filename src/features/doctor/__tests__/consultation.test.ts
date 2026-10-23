import {
  consultationSchema,
  diffConsultation,
  emptyConsultationValues,
  implausibleVitals,
  parseNumber,
  publishIssues,
  toConsultationColumns,
  toConsultationInsert,
  valuesFromConsultation,
  vitalWarnings,
  type ConsultationFormValues,
} from '../consultation';
import { newPrescriptionRow } from '../prescription';
import type { ConsultationRow } from '../types';

const base = (over: Partial<ConsultationFormValues> = {}): ConsultationFormValues => ({
  ...emptyConsultationValues(),
  ...over,
});

const messages = (values: ConsultationFormValues) => {
  const r = consultationSchema.safeParse(values);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
};

describe('consultation vitals validation', () => {
  it('accepts an empty form and normal vitals', () => {
    expect(messages(base())).toEqual([]);
    expect(
      messages(
        base({
          weight_kg: '58.4',
          bp_systolic: '118',
          bp_diastolic: '76',
          pulse: '84',
          temperature: '36.8',
          spo2: '98',
          fundal_height_cm: '24',
          fetal_heart_rate: '146',
        }),
      ),
    ).toEqual([]);
  });

  it('flags the BP 300/20 typo as out of range on both fields', () => {
    const issues = messages(base({ bp_systolic: '300', bp_diastolic: '20' }));
    expect(issues).toContain('bp_systolic:doctor:validation.range.bp_systolic');
    expect(issues).toContain('bp_diastolic:doctor:validation.range.bp_diastolic');
    expect(implausibleVitals(base({ bp_systolic: '300', bp_diastolic: '20' }))).toEqual([
      'bp_systolic',
      'bp_diastolic',
    ]);
  });

  it('rejects non-numbers and impossible readings', () => {
    expect(messages(base({ pulse: 'abc' }))).toContain('pulse:doctor:validation.range.pulse');
    expect(messages(base({ spo2: '101' }))).toContain('spo2:doctor:validation.range.spo2');
    expect(messages(base({ temperature: '45' }))).toContain(
      'temperature:doctor:validation.range.temperature',
    );
    expect(messages(base({ weight_kg: '-5' }))).toContain(
      'weight_kg:doctor:validation.range.weight_kg',
    );
  });

  it('requires the top BP number to be higher than the bottom one', () => {
    expect(messages(base({ bp_systolic: '80', bp_diastolic: '90' }))).toContain(
      'bp_diastolic:doctor:validation.bpOrder',
    );
    expect(messages(base({ bp_systolic: '120', bp_diastolic: '80' }))).toEqual([]);
    expect(messages(base({ bp_systolic: '120' }))).toEqual([]);
  });

  it('validates the next visit as 1-40 weeks', () => {
    expect(messages(base({ next_visit_after_weeks: '4' }))).toEqual([]);
    expect(messages(base({ next_visit_after_weeks: '0' }))).toContain(
      'next_visit_after_weeks:doctor:validation.nextVisit',
    );
    expect(messages(base({ next_visit_after_weeks: '41' }))).toContain(
      'next_visit_after_weeks:doctor:validation.nextVisit',
    );
  });

  it('reports prescription row errors under the row field', () => {
    const row = { ...newPrescriptionRow('k', '2026-09-20'), strength: '5 mg', frequency: 'bad' };
    const issues = messages(base({ prescriptions: [row] }));
    expect(issues).toContain('prescriptions.0.drug_name:doctor:validation.drugRequired');
    expect(issues).toContain('prescriptions.0.frequency:doctor:validation.frequency');
  });

  it('parses decimals with a comma', () => {
    expect(parseNumber('36,8')).toBe(36.8);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('12a')).toBeNaN();
  });
});

describe('vitals warnings', () => {
  it('warns about high BP, fever, low SpO2 and an abnormal fetal heart rate', () => {
    expect(
      vitalWarnings(
        base({
          bp_systolic: '150',
          bp_diastolic: '95',
          temperature: '38.4',
          spo2: '92',
          fetal_heart_rate: '100',
        }),
      ),
    ).toEqual(['bp_high', 'fever', 'spo2_low', 'fhr_abnormal']);
  });

  it('warns about low BP and an abnormal pulse', () => {
    expect(vitalWarnings(base({ bp_systolic: '85', bp_diastolic: '55', pulse: '110' }))).toEqual([
      'bp_low',
      'pulse_abnormal',
    ]);
  });

  it('stays quiet for normal values and for typos (those are errors instead)', () => {
    expect(vitalWarnings(base({ bp_systolic: '118', bp_diastolic: '76', pulse: '84' }))).toEqual(
      [],
    );
    expect(vitalWarnings(base({ bp_systolic: '300', bp_diastolic: '20' }))).toEqual([]);
  });
});

describe('publishing', () => {
  it('needs some patient-facing content', () => {
    expect(publishIssues(base())).toEqual(['publish.needContent']);
    expect(publishIssues(base({ advice: 'Rest' }))).toEqual([]);
    expect(publishIssues(base({ diet_advice: 'More greens' }))).toEqual([]);
    const row = { ...newPrescriptionRow('k', '2026-09-20'), drug_name: 'Folic acid' };
    expect(publishIssues(base({ prescriptions: [row] }))).toEqual([]);
  });

  it('is blocked by invalid values', () => {
    expect(publishIssues(base({ advice: 'Rest', bp_systolic: '300' }))).toEqual([
      'publish.fixErrors',
    ]);
  });
});

describe('database mapping', () => {
  it('turns text into numbers and blanks into null', () => {
    const cols = toConsultationColumns(
      base({
        weight_kg: '58,4',
        bp_systolic: '118',
        pulse: '',
        advice: ' Rest ',
        complaints: ' ',
        next_visit_after_weeks: '4',
      }),
    );
    expect(cols).toMatchObject({
      weight_kg: 58.4,
      bp_systolic: 118,
      pulse: null,
      advice: 'Rest',
      complaints: null,
      next_visit_after_weeks: 4,
    });
  });

  it('leaves invalid vitals out of the autosave instead of failing a DB check', () => {
    const cols = toConsultationColumns(base({ spo2: '150', bp_systolic: '300', pulse: '80' }));
    expect(cols).not.toHaveProperty('spo2');
    expect(cols).not.toHaveProperty('bp_systolic');
    expect(cols.pulse).toBe(80);
  });

  it('builds an insert with the author, pregnancy, appointment and GA snapshot', () => {
    expect(
      toConsultationInsert(base({ advice: 'Rest' }), {
        id: 'c1',
        pregnancyId: 'p1',
        doctorId: 'd1',
        appointmentId: 'a1',
        ga: { weeks: 24, days: 3 },
      }),
    ).toMatchObject({
      id: 'c1',
      pregnancy_id: 'p1',
      doctor_id: 'd1',
      appointment_id: 'a1',
      ga_weeks: 24,
      ga_days: 3,
      advice: 'Rest',
    });
  });

  it('loads form values from a saved consultation, its private note and prescriptions', () => {
    const row = {
      weight_kg: 58.4,
      bp_systolic: 110,
      advice: 'Walk daily',
      next_visit_after_weeks: 4,
    } as ConsultationRow;
    const values = valuesFromConsultation(row, 'secret', []);
    expect(values).toMatchObject({
      weight_kg: '58.4',
      bp_systolic: '110',
      advice: 'Walk daily',
      private_note: 'secret',
      next_visit_after_weeks: '4',
      pulse: '',
    });
    expect(valuesFromConsultation(null, null, [])).toEqual(emptyConsultationValues());
  });
});

describe('autosave diff', () => {
  const row = (key: string, drug: string) => ({
    ...newPrescriptionRow(key, '2026-09-20'),
    drug_name: drug,
  });

  it('writes everything on the first save', () => {
    const cur = base({ advice: 'Rest', prescriptions: [row('a', 'Folic acid')] });
    expect(diffConsultation(null, cur)).toEqual({
      columns: true,
      note: true,
      rows: cur.prescriptions,
      removedIds: [],
    });
  });

  it('writes nothing when nothing changed', () => {
    const cur = base({ advice: 'Rest', prescriptions: [row('a', 'Folic acid')] });
    expect(diffConsultation(cur, { ...cur })).toEqual({
      columns: false,
      note: false,
      rows: [],
      removedIds: [],
    });
  });

  it('writes only what changed: columns, note, edited and new rows', () => {
    const prev = base({
      advice: 'Rest',
      prescriptions: [row('a', 'Folic acid'), row('b', 'Iron')],
    });
    const cur = base({
      advice: 'Rest more',
      private_note: 'secret',
      prescriptions: [row('a', 'Folic acid'), row('b', 'Iron 2'), row('c', 'Calcium')],
    });
    const d = diffConsultation(prev, cur);
    expect(d.columns).toBe(true);
    expect(d.note).toBe(true);
    expect(d.rows.map((r) => r.key)).toEqual(['b', 'c']);
    expect(d.removedIds).toEqual([]);
  });

  it('lists removed rows by database id or key', () => {
    const saved = { ...row('a', 'Folic acid'), id: 'db-1' };
    const prev = base({ prescriptions: [saved, row('b', 'Iron')] });
    const d = diffConsultation(prev, base({ prescriptions: [] }));
    expect(d.removedIds).toEqual(['db-1', 'b']);
  });

  it('ignores edits to fields that are not saved, such as an invalid vital', () => {
    const prev = base({ spo2: '150' });
    expect(diffConsultation(prev, base({ spo2: '160' })).columns).toBe(false);
  });
});
