import assert from 'node:assert/strict';

import { computeFlag, mapTestCode, parseRefRange, resolveRange, toLabResults, unitsCompatible } from './labs.ts';
import { CATALOG } from './testing.ts';

Deno.test('test names map to catalog codes', () => {
  const cases: [string, string | null, string | null][] = [
    ['Haemoglobin', null, 'HB'],
    ['HEMOGLOBIN (Hb)', null, 'HB'],
    ['Platelet Count', null, 'PLT'],
    ['Fasting Blood Sugar', null, 'FBS'],
    ['OGTT 2 Hour (75g)', null, 'OGTT_2H'],
    ['Thyroid Stimulating Hormone', null, 'TSH'],
    ['Urine Protein', null, 'URINE_PROT'],
    ['HIV I & II', null, 'HIV'],
    ['Haemoglobin', 'hb', 'HB'], // model code is normalised
    ['Haemoglobin', 'NOT_A_CODE', 'HB'], // unknown model code falls back to the alias
    ['Serum Ferritin', 'FERRITIN', null], // genuinely unknown stays unmapped
    ['Vitamin D', null, null],
  ];
  for (const [raw, model, expected] of cases) assert.equal(mapTestCode(raw, model, CATALOG), expected, raw);
});

Deno.test('printed reference ranges parse', () => {
  assert.deepEqual(parseRefRange('11-15'), { low: 11, high: 15 });
  assert.deepEqual(parseRefRange('11 – 15 g/dL'), { low: 11, high: 15 });
  assert.deepEqual(parseRefRange('0.4 to 4.0'), { low: 0.4, high: 4 });
  assert.deepEqual(parseRefRange('< 140'), { low: null, high: 140 });
  assert.deepEqual(parseRefRange('up to 5.7'), { low: null, high: 5.7 });
  assert.deepEqual(parseRefRange('>= 150'), { low: 150, high: null });
  assert.equal(parseRefRange('Negative'), null);
  assert.equal(parseRefRange(null), null);
});

Deno.test('flags: low, normal, high at and around the limits', () => {
  const r = { low: 11, high: 15 };
  assert.equal(computeFlag(10.9, null, r), 'low');
  assert.equal(computeFlag(11, null, r), 'normal');
  assert.equal(computeFlag(15, null, r), 'normal');
  assert.equal(computeFlag(15.1, null, r), 'high');
  assert.equal(computeFlag(100, null, { low: null, high: 140 }), 'normal');
  assert.equal(computeFlag(150, null, { low: null, high: 140 }), 'high');
  assert.equal(computeFlag(5, null, { low: null, high: null }), null, 'no range, no flag');
});

Deno.test('flags for text results', () => {
  const none = { low: null, high: null };
  assert.equal(computeFlag(null, 'Non reactive', none), 'normal');
  assert.equal(computeFlag(null, 'Nil', none), 'normal');
  assert.equal(computeFlag(null, 'Negative', none), 'normal');
  assert.equal(computeFlag(null, 'Reactive', none), 'abnormal');
  assert.equal(computeFlag(null, 'Positive (++)', none), 'abnormal');
  assert.equal(computeFlag(null, 'Trace', none), 'abnormal');
  assert.equal(computeFlag(null, 'see comment', none), null);
});

Deno.test('range is trimester-aware (TSH)', () => {
  const tsh = CATALOG.find((t) => t.code === 'TSH');
  assert.deepEqual(resolveRange(tsh, 1, 'mIU/L', null), { low: 0.1, high: 2.5, source: 'catalog' });
  assert.deepEqual(resolveRange(tsh, 2, 'mIU/L', null), { low: 0.2, high: 3, source: 'catalog' });
  assert.equal(computeFlag(2.8, null, resolveRange(tsh, 1, 'mIU/L', null)), 'high');
  assert.equal(computeFlag(2.8, null, resolveRange(tsh, 2, 'mIU/L', null)), 'normal');
});

Deno.test('a unit mismatch never uses the catalog range', () => {
  const fbs = CATALOG.find((t) => t.code === 'FBS');
  assert.ok(!unitsCompatible('mg/dL', 'mmol/L'));
  assert.ok(unitsCompatible('mg/dL', 'MG/DL'));
  assert.deepEqual(resolveRange(fbs, 2, 'mmol/L', '3.9-5.5'), { low: 3.9, high: 5.5, source: 'report' });
  assert.deepEqual(resolveRange(fbs, 2, 'mmol/L', null), { low: null, high: null, source: 'none' });
});

Deno.test('toLabResults builds unverified AI rows with mapped codes and flags', () => {
  const { rows, values } = toLabResults(
    [
      { raw_name: 'Haemoglobin', test_code: null, value: 10.2, value_text: null, unit: 'g/dL', ref_range_on_report: '11-15', confidence: 0.934 },
      { raw_name: 'Mystery Panel', test_code: null, value: 4, value_text: null, unit: 'u', ref_range_on_report: null, confidence: 0.5 },
    ],
    { report_id: 'r', pregnancy_id: 'p', observed_on: '2026-10-20', trimester: 3 },
    CATALOG,
  );
  assert.equal(rows[0]?.test_code, 'HB');
  assert.equal(rows[0]?.flag, 'low');
  assert.equal(rows[0]?.source, 'ai_extracted');
  assert.equal(rows[0]?.verified, false);
  assert.equal(rows[0]?.confidence, 0.93);
  assert.equal(rows[0]?.observed_on, '2026-10-20');
  assert.equal(rows[1]?.test_code, null);
  assert.equal(rows[1]?.flag, null);
  assert.equal(values[0]?.test_code, 'HB', 'the stored draft carries the mapped code');
});
