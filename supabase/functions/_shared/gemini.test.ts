import assert from 'node:assert/strict';

import { buildContext } from './context.ts';
import {
  AiProviderError,
  createProvider,
  EXTRACTION_RESPONSE_SCHEMA,
  GeminiProvider,
  LAB_VALUE_RESPONSE_SCHEMA,
  MockProvider,
  SUMMARY_RESPONSE_SCHEMA,
} from './gemini.ts';
import { aiLabValueSchema, aiSummarySchema, extractionOutputSchema, summaryOutputSchema } from './schemas.ts';
import { contextSource, PII } from './testing.ts';

const ctx = buildContext(contextSource());
const files = [{ mime_type: 'application/pdf', data: new Uint8Array([37, 80, 68, 70]) }];

Deno.test('mock output validates against the schema for every report type', async () => {
  const p = new MockProvider();
  for (const type of ['blood', 'urine', 'thyroid', 'gtt', 'ultrasound', 'ecg', 'other']) {
    const res = await p.extractReport({ context: ctx, report_type: type, files: [] });
    assert.ok(extractionOutputSchema.safeParse(res.output).success, `report type ${type}`);
  }
});

Deno.test('mock summaries validate for consultation and pregnancy', async () => {
  const p = new MockProvider();
  const c = await p.summarizeConsultation({ context: buildContext(contextSource(), { ga_weeks: 20, ga_days: 1, weight_kg: null, bp_systolic: 150, bp_diastolic: 95, pulse: null, temperature: null, spo2: null, fundal_height_cm: null, fetal_heart_rate: 140, presentation: null, fetal_movements: null, edema: null, urine_albumin: null, urine_sugar: null, complaints: null, findings: null, advice: 'Rest', diet_advice: null, next_visit_after_weeks: 2 }) });
  const parsed = summaryOutputSchema.parse(c.output);
  assert.ok(parsed.summary.doctor_attention_flags?.some((f) => f.includes('150/95')), 'high BP goes to the doctor flags');
  const g = await p.summarizePregnancy({ context: buildContext(contextSource({ labs: [{ test_code: 'HB', value_num: 10, value_text: null, unit: 'g/dL', observed_on: '2026-10-01' }] })) });
  assert.ok(summaryOutputSchema.safeParse(g.output).success);
});

Deno.test('mock is deterministic and honours the report type', async () => {
  const p = new MockProvider();
  const a = await p.extractReport({ context: ctx, report_type: 'blood', files: [] });
  const b = await p.extractReport({ context: ctx, report_type: 'blood', files: [] });
  assert.deepEqual(a.output, b.output);
  const out = extractionOutputSchema.parse(a.output);
  assert.equal(out.lab_values[0]?.value, 10.2);
  assert.equal(extractionOutputSchema.parse((await p.extractReport({ context: ctx, report_type: 'ultrasound', files: [] })).output).lab_values.length, 0);
});

Deno.test('mock follows report text, and keeps medicine conflicts doctor-only', async () => {
  const p = new MockProvider();
  const withNsaid = buildContext(contextSource({ medications: [{ drug_name: 'Ibuprofen', strength: '400 mg', dose: '1', frequency: '1-0-1', timing: null }] }));
  const res = await p.extractReport({
    context: withNsaid,
    report_type: 'blood',
    files: [],
    report_text: 'Haemoglobin | 9.4 | g/dL | 11-15\nUrine Protein | Nil',
  });
  const out = extractionOutputSchema.parse(res.output);
  assert.deepEqual(out.lab_values.map((v) => [v.raw_name, v.value, v.value_text]), [['Haemoglobin', 9.4, null], ['Urine Protein', null, 'Nil']]);
  assert.ok(out.summary.doctor_attention_flags?.some((f) => /Ibuprofen/.test(f)));
  const patientFacing = JSON.stringify({ ...out.summary, doctor_attention_flags: undefined });
  assert.ok(!/stop taking|\bmg\b|\bdose\b/i.test(patientFacing), 'no dosing or stop-taking advice for the patient');
});

Deno.test('mock foods respect allergies', async () => {
  const p = new MockProvider();
  const c = buildContext(contextSource({ patient: { ...contextSource().patient, allergies: ['paneer'] } }));
  const out = summaryOutputSchema.parse((await p.summarizePregnancy({ context: c })).output);
  assert.ok(!JSON.stringify(out.summary.foods_to_eat).toLowerCase().includes('paneer'));
});

Deno.test('mock can simulate failures', async () => {
  const always = new MockProvider('fail_always');
  await assert.rejects(always.extractReport({ context: ctx, report_type: 'blood', files: [] }), AiProviderError);
  const once = new MockProvider('fail_once');
  await assert.rejects(once.summarizePregnancy({ context: ctx }), AiProviderError);
  assert.ok((await once.summarizePregnancy({ context: ctx })).output);
  assert.equal(once.callCount, 2);
  const invalid = await new MockProvider('invalid').summarizePregnancy({ context: ctx });
  assert.equal(summaryOutputSchema.safeParse(invalid.output).success, false);
});

Deno.test('provider selection by env; gemini needs key and model', () => {
  const env = (m: Record<string, string>) => ({ get: (k: string) => m[k] });
  assert.equal(createProvider(env({})).name, 'mock');
  assert.equal(createProvider(env({ AI_PROVIDER: 'mock', AI_MOCK_BEHAVIOR: 'fail_always' })).name, 'mock');
  assert.throws(() => createProvider(env({ AI_PROVIDER: 'gemini' })), /AI_NOT_CONFIGURED/);
  assert.throws(() => createProvider(env({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })), /AI_NOT_CONFIGURED/);
  assert.throws(() => createProvider(env({ AI_PROVIDER: 'nonsense' })), /AI_NOT_CONFIGURED/);
  assert.equal(createProvider(env({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'm' })).name, 'gemini');
});

Deno.test('gemini request: structured output, de-identified prompt, key only in the header', async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const fakeFetch = ((url: string, init: RequestInit) => {
    captured = { url, init };
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"lab_values":[],"summary":{}}' }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } })),
    );
  }) as unknown as typeof fetch;
  const p = new GeminiProvider({ apiKey: 'TEST_KEY_NOT_REAL', model: 'gemini-test', fetchFn: fakeFetch });
  const res = await p.extractReport({ context: ctx, report_type: 'blood', files });
  assert.deepEqual(res.usage, { prompt_tokens: 7, output_tokens: 3 });

  const body = JSON.parse(String(captured?.init.body));
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema, EXTRACTION_RESPONSE_SCHEMA);
  assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'application/pdf');
  assert.ok(captured?.url.includes('models/gemini-test:generateContent'));
  assert.equal((captured?.init.headers as Record<string, string>)['x-goog-api-key'], 'TEST_KEY_NOT_REAL');
  const serialised = JSON.stringify(body);
  assert.ok(!serialised.includes('TEST_KEY_NOT_REAL'), 'the key is never in the body');
  for (const secret of [PII.name, PII.mrn, PII.phone, PII.email, PII.address, PII.doctor]) assert.ok(!serialised.includes(secret));
  assert.match(body.systemInstruction.parts[0].text, /Never diagnose/);
});

Deno.test('gemini errors do not echo the response body', async () => {
  const bad = ((_u: string, _i: RequestInit) => Promise.resolve(new Response('PATIENT TEXT echoed back', { status: 503 }))) as unknown as typeof fetch;
  const p = new GeminiProvider({ apiKey: 'k', model: 'm', fetchFn: bad });
  await assert.rejects(p.summarizePregnancy({ context: ctx }), (e: Error) => e instanceof AiProviderError && !e.message.includes('PATIENT') && e.message.includes('503'));
  const notJson = (() => Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })))) as unknown as typeof fetch;
  await assert.rejects(new GeminiProvider({ apiKey: 'k', model: 'm', fetchFn: notJson }).summarizePregnancy({ context: ctx }), /invalid json/);
});

// The Gemini responseSchema and the zod schema must describe the same object.
Deno.test('response schemas stay in sync with zod', () => {
  const props = (s: unknown) => Object.keys((s as { properties: Record<string, unknown> }).properties).sort();
  const required = (s: unknown) => [...(s as { required: string[] }).required].sort();
  assert.deepEqual(props(SUMMARY_RESPONSE_SCHEMA), Object.keys(aiSummarySchema.shape).sort());
  assert.deepEqual(props(LAB_VALUE_RESPONSE_SCHEMA), Object.keys(aiLabValueSchema.shape).sort());
  const optionalInZod = Object.entries(aiSummarySchema.shape).filter(([, v]) => v.safeParse(undefined).success).map(([k]) => k);
  assert.deepEqual(required(SUMMARY_RESPONSE_SCHEMA), Object.keys(aiSummarySchema.shape).filter((k) => !optionalInZod.includes(k)).sort());
  assert.deepEqual(required(LAB_VALUE_RESPONSE_SCHEMA), Object.keys(aiLabValueSchema.shape).sort());
});
