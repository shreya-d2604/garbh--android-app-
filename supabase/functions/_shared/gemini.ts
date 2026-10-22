// AI provider wrapper (PLAN.md §9). Everything the Edge Functions know about "the model" is the
// AiProvider interface. Two implementations:
//   MockProvider   deterministic, schema-valid, no network. The default (AI_PROVIDER=mock).
//   GeminiProvider the real client shape (structured output + responseSchema). It is NOT used in
//                  this phase: no key exists anywhere and createProvider() only returns it when
//                  AI_PROVIDER=gemini AND a key + model are configured.
// Providers return RAW JSON (`unknown`); the caller re-validates it with zod before use.
import { type DeidentifiedContext } from './context.ts';
import { consultationPrompt, extractionPrompt, pregnancyPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from './prompts.ts';

export interface ProviderFile {
  mime_type: string;
  data: Uint8Array;
}

export interface ProviderUsage {
  prompt_tokens?: number;
  output_tokens?: number;
}

export interface ProviderResult {
  output: unknown;
  usage?: ProviderUsage;
}

export interface ExtractReportInput {
  context: DeidentifiedContext;
  report_type: string;
  files: ProviderFile[];
  /** Plain-text rendition of the report (eval harness / tests). Real runs send the files. */
  report_text?: string;
}

export interface AiProvider {
  readonly name: string;
  /** Model id stored on ai_summaries.model. */
  readonly model: string;
  readonly promptVersion: string;
  /** False for the mock: the functions then skip downloading report files. */
  readonly needsFiles: boolean;
  extractReport(input: ExtractReportInput): Promise<ProviderResult>;
  summarizeConsultation(input: { context: DeidentifiedContext }): Promise<ProviderResult>;
  summarizePregnancy(input: { context: DeidentifiedContext }): Promise<ProviderResult>;
}

export class AiProviderError extends Error {
  constructor(message: string, readonly retryable = true) {
    super(message);
    this.name = 'AiProviderError';
  }
}

// ---------------------------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------------------------

export type MockBehavior = 'ok' | 'fail_once' | 'fail_always' | 'invalid';

type Range = [number | null, number | null];

/** What the mock "knows" about normal ranges (the server recomputes real flags from the catalog). */
const MOCK_KNOWLEDGE: Record<string, { name: string; unit: string; range: Range; text?: string }> = {
  HB: { name: 'Haemoglobin', unit: 'g/dL', range: [11, 15] },
  PLT: { name: 'Platelet count', unit: '10^3/uL', range: [150, 400] },
  TSH: { name: 'TSH', unit: 'mIU/L', range: [0.1, 3] },
  FBS: { name: 'Fasting blood sugar', unit: 'mg/dL', range: [60, 92] },
  PPBS: { name: 'Post-prandial blood sugar', unit: 'mg/dL', range: [null, 120] },
  OGTT_2H: { name: 'OGTT 75g (2 hour)', unit: 'mg/dL', range: [null, 140] },
  HBA1C: { name: 'HbA1c', unit: '%', range: [null, 6] },
};

interface MockValue {
  raw_name: string;
  test_code: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_range_on_report: string | null;
  confidence: number;
}

/** Canned results per report type, so the pipeline can be exercised end to end. */
const MOCK_REPORTS: Record<string, MockValue[]> = {
  blood: [
    { raw_name: 'Haemoglobin', test_code: 'HB', value: 10.2, value_text: null, unit: 'g/dL', ref_range_on_report: '11-15', confidence: 0.93 },
    { raw_name: 'Platelet Count', test_code: 'PLT', value: 245, value_text: null, unit: '10^3/uL', ref_range_on_report: '150-400', confidence: 0.9 },
  ],
  thyroid: [
    { raw_name: 'TSH', test_code: 'TSH', value: 3.4, value_text: null, unit: 'mIU/L', ref_range_on_report: '0.4-4.0', confidence: 0.92 },
  ],
  gtt: [
    { raw_name: 'Fasting Blood Sugar', test_code: 'FBS', value: 88, value_text: null, unit: 'mg/dL', ref_range_on_report: '70-100', confidence: 0.94 },
    { raw_name: 'OGTT 2 Hour (75g)', test_code: 'OGTT_2H', value: 152, value_text: null, unit: 'mg/dL', ref_range_on_report: '< 140', confidence: 0.9 },
  ],
  urine: [
    { raw_name: 'Urine Protein', test_code: 'URINE_PROT', value: null, value_text: 'Nil', unit: null, ref_range_on_report: null, confidence: 0.88 },
  ],
};

/**
 * "Haemoglobin | 10.2 | g/dL | 11-15" (name | value | unit | printed range), one test per line.
 * Lets the eval set and tests drive the mock with the text of a synthetic report.
 */
function parseReportText(text: string): MockValue[] {
  const out: MockValue[] = [];
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 2 || !cells[0] || !cells[1]) continue;
    const num = /^-?\d+(\.\d+)?$/.test(cells[1]) ? Number(cells[1]) : null;
    out.push({
      raw_name: cells[0],
      test_code: null,
      value: num,
      value_text: num === null ? cells[1] : null,
      unit: num === null ? null : cells[2] || null,
      ref_range_on_report: cells[3] || null,
      confidence: 0.9,
    });
  }
  return out;
}

const NSAID = /ibuprofen|diclofenac|naproxen|aspirin|nimesulide|ketorolac/i;

function codeOf(v: MockValue): string | null {
  if (v.test_code) return v.test_code;
  const n = v.raw_name.toLowerCase();
  if (/haemoglobin|hemoglobin|^hb$/.test(n) && !/a1c/.test(n)) return 'HB';
  if (/platelet/.test(n)) return 'PLT';
  if (/tsh|thyroid stimulating/.test(n)) return 'TSH';
  if (/fasting/.test(n)) return 'FBS';
  if (/ogtt|2 ?h(ou)?r/.test(n)) return 'OGTT_2H';
  if (/post[- ]?prandial|ppbs/.test(n)) return 'PPBS';
  if (/a1c/.test(n)) return 'HBA1C';
  return null;
}

function allergyFilter<T extends { item: string }>(items: T[], ctx: DeidentifiedContext): T[] {
  const allergies = ctx.allergies.map((a) => a.toLowerCase());
  return items.filter((i) => !allergies.some((a) => a && i.item.toLowerCase().includes(a)));
}

function baseSummary(ctx: DeidentifiedContext) {
  const flags: string[] = [];
  const meds = ctx.active_medications.filter((m) => NSAID.test(m.drug_name));
  for (const m of meds) {
    flags.push(`Patient is prescribed ${m.drug_name}; this draft lists NSAID painkillers under medicines to check with the doctor. Review before publishing.`);
  }
  return {
    foods_to_eat: allergyFilter(
      [
        { item: 'Dal, eggs or paneer, and green leafy vegetables', why: 'Protein, iron and folate for you and your baby' },
        { item: 'Seasonal fruits and nuts', why: 'Vitamins and healthy fats' },
      ],
      ctx,
    ),
    foods_to_avoid: [{ item: 'Raw papaya and unpasteurised milk', why: 'Can be unsafe in pregnancy' }],
    medicines_to_avoid: [
      { item: 'Ibuprofen and other NSAID painkillers', why: 'Please check with your doctor before taking any painkiller' },
    ],
    lifestyle_tips: ['Drink plenty of water', 'Walk for about 20 minutes each day if your doctor agrees', 'Rest when you feel tired'],
    questions_for_doctor: ['Is there anything I should change in my diet?'],
    doctor_attention_flags: flags,
  };
}

function gaLabel(ctx: DeidentifiedContext): string {
  return ctx.gestational_age ? `${ctx.gestational_age.weeks} weeks` : 'this stage of pregnancy';
}

function extractionSummary(values: MockValue[], ctx: DeidentifiedContext) {
  const base = baseSummary(ctx);
  const findings: { finding: string; status: 'normal' | 'attention' | 'urgent'; explanation: string }[] = [];
  const flags = [...base.doctor_attention_flags];
  for (const v of values) {
    const code = codeOf(v);
    const k = code ? MOCK_KNOWLEDGE[code] : undefined;
    if (v.value === null || !k) {
      if (v.value_text) findings.push({ finding: `${v.raw_name}: ${v.value_text}`, status: 'normal', explanation: 'This result was read from your report.' });
      continue;
    }
    const [lo, hi] = k.range;
    const low = lo !== null && v.value < lo;
    const high = hi !== null && v.value > hi;
    const unit = v.unit ?? k.unit;
    findings.push({
      finding: `${v.raw_name}: ${v.value} ${unit}`,
      status: low || high ? 'attention' : 'normal',
      explanation: low ? 'This is a little below the usual range.' : high ? 'This is a little above the usual range.' : 'This is within the usual range.',
    });
    if (low || high) flags.push(`${k.name} ${v.value} ${unit} at ${gaLabel(ctx)}: ${low ? 'below' : 'above'} range, please review.`);
  }
  const abnormal = findings.filter((f) => f.status !== 'normal');
  return {
    ...base,
    headline: abnormal.length ? 'Some of your results need your doctor\'s attention.' : 'Your results look fine.',
    plain_language_summary: abnormal.length
      ? 'Most of your report looks as expected. A few values are slightly outside the usual range. Your doctor will explain what this means for you.'
      : 'The values we could read from your report are within the usual range. Your doctor will go through it with you.',
    key_findings: findings,
    doctor_attention_flags: flags,
    confidence_note: 'Drafted by an AI assistant from the report. Your doctor has checked it.',
  };
}

export class MockProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'mock-1';
  readonly promptVersion = PROMPT_VERSION;
  readonly needsFiles = false;
  private calls = 0;

  constructor(private readonly behavior: MockBehavior = 'ok') {}

  /** Number of provider calls so far (tests assert the retry-once rule with it). */
  get callCount(): number {
    return this.calls;
  }

  private run(build: () => unknown): Promise<ProviderResult> {
    this.calls += 1;
    if (this.behavior === 'fail_always' || (this.behavior === 'fail_once' && this.calls === 1)) {
      return Promise.reject(new AiProviderError('mock provider failure'));
    }
    const output = this.behavior === 'invalid' ? { summary: { headline: 42 } } : build();
    return Promise.resolve({ output, usage: { prompt_tokens: 0, output_tokens: 0 } });
  }

  extractReport(input: ExtractReportInput): Promise<ProviderResult> {
    return this.run(() => {
      const fromText = input.report_text ? parseReportText(input.report_text) : [];
      const values = fromText.length ? fromText : (MOCK_REPORTS[input.report_type] ?? []);
      return { lab_values: values, summary: extractionSummary(values, input.context) };
    });
  }

  summarizeConsultation({ context }: { context: DeidentifiedContext }): Promise<ProviderResult> {
    return this.run(() => {
      const c = context.consultation ?? {};
      const base = baseSummary(context);
      const findings: { finding: string; status: 'normal' | 'attention' | 'urgent'; explanation: string }[] = [];
      const sys = Number(c.bp_systolic ?? 0);
      const dia = Number(c.bp_diastolic ?? 0);
      if (sys && dia) {
        const high = sys >= 140 || dia >= 90;
        findings.push({
          finding: `Blood pressure ${sys}/${dia}`,
          status: high ? 'attention' : 'normal',
          explanation: high ? 'Your blood pressure was higher than usual. Your doctor may check it again.' : 'Your blood pressure was in the usual range.',
        });
      }
      if (c.fetal_heart_rate) {
        findings.push({ finding: `Baby\'s heartbeat ${c.fetal_heart_rate} per minute`, status: 'normal', explanation: 'The baby\'s heartbeat was checked.' });
      }
      return {
        summary: {
          ...base,
          headline: 'Summary of your visit',
          plain_language_summary: `At ${gaLabel(context)}, your doctor checked you and your baby.${c.advice ? ` Your doctor advised: ${String(c.advice)}` : ''}`,
          key_findings: findings,
          doctor_attention_flags: [...base.doctor_attention_flags, ...(sys >= 140 || dia >= 90 ? [`BP ${sys}/${dia} at ${gaLabel(context)}: review.`] : [])],
          confidence_note: 'Drafted by an AI assistant from your visit notes. Your doctor has checked it.',
        },
      };
    });
  }

  summarizePregnancy({ context }: { context: DeidentifiedContext }): Promise<ProviderResult> {
    return this.run(() => {
      const base = baseSummary(context);
      const findings = Object.entries(context.recent_labs).flatMap(([code, rows]) => {
        const latest = rows[0];
        const k = MOCK_KNOWLEDGE[code];
        if (!latest || !k || typeof latest.value !== 'number') return [];
        const [lo, hi] = k.range;
        const off = (lo !== null && latest.value < lo) || (hi !== null && latest.value > hi);
        return [{ finding: `${k.name}: ${latest.value} ${latest.unit ?? k.unit}`, status: off ? ('attention' as const) : ('normal' as const), explanation: off ? 'Your doctor is keeping an eye on this.' : 'This is within the usual range.' }];
      });
      return {
        summary: {
          ...base,
          headline: `Your pregnancy so far: ${gaLabel(context)}`,
          plain_language_summary: `You are ${gaLabel(context)} pregnant. This is a summary of your doctor-checked results so far.`,
          key_findings: findings,
          confidence_note: 'Drafted by an AI assistant from your doctor-checked records.',
        },
      };
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Gemini (real client shape; unused in this phase)
// ---------------------------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;
const str = (nullable = false): JsonSchema => ({ type: 'string', ...(nullable ? { nullable: true } : {}) });
const num = (nullable = false): JsonSchema => ({ type: 'number', ...(nullable ? { nullable: true } : {}) });
const arr = (items: JsonSchema): JsonSchema => ({ type: 'array', items });
const obj = (properties: Record<string, JsonSchema>, required: string[]): JsonSchema => ({ type: 'object', properties, required });
const itemWhy = obj({ item: str(), why: str() }, ['item', 'why']);

/** Gemini `responseSchema` (OpenAPI subset) for the §9.3 summary object. */
export const SUMMARY_RESPONSE_SCHEMA: JsonSchema = obj(
  {
    headline: str(),
    plain_language_summary: str(),
    key_findings: arr(
      obj({ finding: str(), status: { type: 'string', enum: ['normal', 'attention', 'urgent'] }, explanation: str() }, ['finding', 'status', 'explanation']),
    ),
    foods_to_eat: arr(itemWhy),
    foods_to_avoid: arr(itemWhy),
    medicines_to_avoid: arr(itemWhy),
    lifestyle_tips: arr(str()),
    questions_for_doctor: arr(str()),
    doctor_attention_flags: arr(str()),
    confidence_note: str(),
  },
  ['headline', 'plain_language_summary', 'key_findings', 'foods_to_eat', 'foods_to_avoid', 'medicines_to_avoid', 'lifestyle_tips', 'questions_for_doctor'],
);

export const LAB_VALUE_RESPONSE_SCHEMA: JsonSchema = obj(
  {
    raw_name: str(),
    test_code: str(true),
    value: num(true),
    value_text: str(true),
    unit: str(true),
    ref_range_on_report: str(true),
    confidence: num(),
  },
  ['raw_name', 'test_code', 'value', 'value_text', 'unit', 'ref_range_on_report', 'confidence'],
);

export const EXTRACTION_RESPONSE_SCHEMA: JsonSchema = obj(
  { lab_values: arr(LAB_VALUE_RESPONSE_SCHEMA), summary: SUMMARY_RESPONSE_SCHEMA },
  ['lab_values', 'summary'],
);
export const SUMMARY_ONLY_RESPONSE_SCHEMA: JsonSchema = obj({ summary: SUMMARY_RESPONSE_SCHEMA }, ['summary']);

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Injected for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly promptVersion = PROMPT_VERSION;
  readonly needsFiles = true;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: GeminiOptions) {
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  get model(): string {
    return this.opts.model;
  }

  /** Builds the generateContent request. Exposed for tests; contains no secrets (key is a header). */
  buildRequest(prompt: string, schema: JsonSchema, files: ProviderFile[] = []): Record<string, unknown> {
    return {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, ...files.map((f) => ({ inlineData: { mimeType: f.mime_type, data: base64(f.data) } }))],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    };
  }

  private async call(prompt: string, schema: JsonSchema, files: ProviderFile[] = []): Promise<ProviderResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.opts.model)}:generateContent`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
      body: JSON.stringify(this.buildRequest(prompt, schema, files)),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 60_000),
    });
    if (!res.ok) {
      // Never include the response body: it may echo the prompt.
      throw new AiProviderError(`gemini http ${res.status}`, res.status >= 500 || res.status === 429);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new AiProviderError('gemini returned no content');
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new AiProviderError('gemini returned invalid json');
    }
    return {
      output,
      usage: { prompt_tokens: data.usageMetadata?.promptTokenCount, output_tokens: data.usageMetadata?.candidatesTokenCount },
    };
  }

  extractReport(input: ExtractReportInput): Promise<ProviderResult> {
    return this.call(extractionPrompt(input.context, input.report_type, input.report_text), EXTRACTION_RESPONSE_SCHEMA, input.files);
  }
  summarizeConsultation({ context }: { context: DeidentifiedContext }): Promise<ProviderResult> {
    return this.call(consultationPrompt(context), SUMMARY_ONLY_RESPONSE_SCHEMA);
  }
  summarizePregnancy({ context }: { context: DeidentifiedContext }): Promise<ProviderResult> {
    return this.call(pregnancyPrompt(context), SUMMARY_ONLY_RESPONSE_SCHEMA);
  }
}

// ---------------------------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------------------------

export interface ProviderEnv {
  get(name: string): string | undefined;
}

/** `AI_PROVIDER=mock` (default) | `gemini`. Gemini needs GEMINI_API_KEY and GEMINI_MODEL. */
export function createProvider(env: ProviderEnv): AiProvider {
  const which = (env.get('AI_PROVIDER') ?? 'mock').toLowerCase();
  if (which === 'mock') {
    const b = (env.get('AI_MOCK_BEHAVIOR') ?? 'ok') as MockBehavior;
    return new MockProvider(['ok', 'fail_once', 'fail_always', 'invalid'].includes(b) ? b : 'ok');
  }
  if (which === 'gemini') {
    const apiKey = env.get('GEMINI_API_KEY');
    const model = env.get('GEMINI_MODEL');
    if (!apiKey || !model) throw new Error('AI_NOT_CONFIGURED');
    return new GeminiProvider({ apiKey, model });
  }
  throw new Error('AI_NOT_CONFIGURED');
}
