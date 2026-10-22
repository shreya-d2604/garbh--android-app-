import assert from 'node:assert/strict';

import { ageYears, assertDeidentified, buildContext, gaFromEdd, identifiersOf, scrubText } from './context.ts';
import { contextSource, PII } from './testing.ts';

const idents = identifiersOf(contextSource().patient, [PII.doctor]);

Deno.test('context carries the allowed fields only', () => {
  const ctx = buildContext(
    contextSource({
      medications: [{ drug_name: 'Ferrous ascorbate', strength: '100 mg', dose: '1 tablet', frequency: '0-1-0', timing: 'After food' }],
      labs: [
        { test_code: 'HB', value_num: 10.4, value_text: null, unit: 'g/dL', observed_on: '2026-09-01' },
        { test_code: 'HB', value_num: 10.9, value_text: null, unit: 'g/dL', observed_on: '2026-09-15' },
        { test_code: 'HB', value_num: 11.2, value_text: null, unit: 'g/dL', observed_on: '2026-10-01' },
        { test_code: 'HB', value_num: 9.0, value_text: null, unit: 'g/dL', observed_on: '2026-01-01' },
        { test_code: 'HIV', value_num: null, value_text: 'Non reactive', unit: null, observed_on: '2026-10-01' },
      ],
    }),
  );
  assert.deepEqual(Object.keys(ctx).sort(), [
    'active_medications', 'age_years', 'allergies', 'chronic_conditions', 'gestational_age', 'gpal',
    'multiple_gestation', 'recent_labs', 'risk_factors', 'risk_level',
  ]);
  assert.equal(ctx.age_years, 32);
  // EDD 2027-01-05 -> GA on 2026-10-22 = 280 - 75 = 205 days = 29w2d, third trimester.
  assert.deepEqual(ctx.gestational_age, { weeks: 29, days: 2, trimester: 3 });
  assert.equal(ctx.recent_labs.HB?.length, 3, 'only the last 3 values');
  assert.deepEqual(ctx.recent_labs.HB?.map((v) => v.value), [11.2, 10.9, 10.4]);
  assert.equal(ctx.recent_labs.HIV, undefined, 'only key labs');
});

Deno.test('no name, MRN, phone, email, address or doctor name reaches the payload', () => {
  const ctx = buildContext(contextSource(), {
    ga_weeks: 20, ga_days: 3, weight_kg: 58, bp_systolic: 110, bp_diastolic: 70, pulse: 84, temperature: null, spo2: null,
    fundal_height_cm: 20, fetal_heart_rate: 146, presentation: 'Cephalic', fetal_movements: null, edema: null,
    urine_albumin: null, urine_sugar: null,
    complaints: `Patient ${PII.name} reports tiredness`,
    findings: `Seen by ${PII.doctor}. Contact ${PII.email} or ${PII.phone}`,
    advice: `${PII.mrn}: rest. Address ${PII.address}`,
    diet_advice: 'Leafy vegetables', next_visit_after_weeks: 4,
  });
  const payload = JSON.stringify(ctx).toLowerCase();
  for (const secret of [PII.name, PII.mrn, PII.phone, PII.email, PII.address, PII.doctor, 'zorbia', 'quillfeather', 'wimbleton']) {
    assert.ok(!payload.includes(secret.toLowerCase()), `payload must not contain ${secret}`);
  }
  assert.match(JSON.stringify(ctx.consultation), /\[removed\]/);
});

Deno.test('extra columns on the input rows are never copied', () => {
  const src = contextSource();
  (src.patient as unknown as Record<string, unknown>).secret_column = 'sentinel-value';
  (src.pregnancy as unknown as Record<string, unknown>).patient_id = 'sentinel-id';
  const ctx = buildContext(src);
  assert.ok(!JSON.stringify(ctx).includes('sentinel'));
});

Deno.test('assertDeidentified throws when an identifier slips through', () => {
  assert.throws(() => assertDeidentified({ note: `call ${PII.phone}` }, idents), /PII_LEAK/);
  assert.doesNotThrow(() => assertDeidentified({ note: 'all clear' }, idents));
});

Deno.test('scrubText is case-insensitive and handles null', () => {
  assert.equal(scrubText(`${PII.name.toUpperCase()} is well`, idents), '[removed] is well');
  assert.equal(scrubText(null, idents), null);
});

Deno.test('age and GA math', () => {
  assert.equal(ageYears('1994-10-23', '2026-10-22'), 31);
  assert.equal(ageYears('1994-10-22', '2026-10-22'), 32);
  assert.equal(ageYears(null, '2026-10-22'), null);
  // Mirrors SQL ga_from_edd: weeks 13/14 and 27/28 boundaries.
  assert.deepEqual(gaFromEdd('2027-01-05', '2026-10-22'), { weeks: 29, days: 2, trimester: 3 });
  assert.equal(gaFromEdd('2027-01-05', '2026-04-09')?.trimester, 1);
  assert.equal(gaFromEdd(null, '2026-10-22'), null);
  const edd = '2027-03-01';
  const day0 = Date.UTC(2027, 2, 1) - 280 * 86_400_000;
  const on = (d: number) => new Date(day0 + d * 86_400_000).toISOString().slice(0, 10);
  assert.equal(gaFromEdd(edd, on(97))?.trimester, 1); // 13w6d
  assert.equal(gaFromEdd(edd, on(98))?.trimester, 2); // 14w0d
  assert.equal(gaFromEdd(edd, on(195))?.trimester, 2); // 27w6d
  assert.equal(gaFromEdd(edd, on(196))?.trimester, 3); // 28w0d
});
