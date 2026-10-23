// Mapping of extracted test names to lab_tests.code, and flags against reference ranges
// (PLAN.md §8.2 "map test names -> lab_tests codes; compute flags vs ref ranges").

export interface LabTest {
  code: string;
  name: string;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  /** e.g. {"1":{"low":0.1,"high":2.5},"2":{...}} */
  trimester_ref: Record<string, { low?: number | null; high?: number | null }> | null;
}

export type LabFlag = 'low' | 'normal' | 'high' | 'abnormal';

/** Normalised printed names -> catalog code. Keys are lower-case, punctuation collapsed. */
const ALIASES: Record<string, string> = {
  'haemoglobin': 'HB', 'hemoglobin': 'HB', 'hb': 'HB', 'hgb': 'HB', 'haemoglobin hb': 'HB',
  'platelet count': 'PLT', 'platelets': 'PLT', 'platelet': 'PLT', 'plt': 'PLT',
  'tsh': 'TSH', 'thyroid stimulating hormone': 'TSH', 'serum tsh': 'TSH',
  'fasting blood sugar': 'FBS', 'fbs': 'FBS', 'fasting glucose': 'FBS', 'fasting plasma glucose': 'FBS',
  'fasting blood glucose': 'FBS', 'fbg': 'FBS',
  'post prandial blood sugar': 'PPBS', 'ppbs': 'PPBS', 'post prandial glucose': 'PPBS',
  'postprandial blood sugar': 'PPBS', 'pp blood sugar': 'PPBS',
  'ogtt 2 hour': 'OGTT_2H', 'ogtt 2 hr': 'OGTT_2H', 'ogtt 2h': 'OGTT_2H', 'ogtt 75g 2 hour': 'OGTT_2H',
  'ogtt 75g 2 hr': 'OGTT_2H', '75g ogtt 2 hour': 'OGTT_2H', '2 hour ogtt': 'OGTT_2H',
  'glucose 2 hour post 75g': 'OGTT_2H', 'ogtt 2 hour value': 'OGTT_2H',
  'hba1c': 'HBA1C', 'hb a1c': 'HBA1C', 'glycosylated haemoglobin': 'HBA1C', 'glycated haemoglobin': 'HBA1C',
  'glycosylated hemoglobin': 'HBA1C', 'glycated hemoglobin': 'HBA1C',
  'urine protein': 'URINE_PROT', 'urine albumin': 'URINE_PROT', 'protein urine': 'URINE_PROT',
  'urine protein albumin': 'URINE_PROT',
  'hiv': 'HIV', 'hiv 1 2': 'HIV', 'hiv 1 and 2': 'HIV', 'hiv i ii': 'HIV',
  'hbsag': 'HBSAG', 'hepatitis b surface antigen': 'HBSAG', 'hbs ag': 'HBSAG',
  'vdrl': 'VDRL', 'vdrl rpr': 'VDRL',
};

export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Catalog code for a printed test name. A code proposed by the model is trusted only when it
 * exists in the catalog; otherwise the alias table decides. Unknown tests stay unmapped (null)
 * and are shown to the doctor as-is.
 */
export function mapTestCode(rawName: string, modelCode: string | null, catalog: LabTest[]): string | null {
  const codes = new Set(catalog.map((t) => t.code));
  const proposed = modelCode?.trim().toUpperCase();
  if (proposed && codes.has(proposed)) return proposed;
  const alias = ALIASES[normalizeName(rawName)];
  if (alias && codes.has(alias)) return alias;
  const direct = rawName.trim().toUpperCase();
  return codes.has(direct) ? direct : null;
}

export interface Range {
  low: number | null;
  high: number | null;
}

/** "11-15", "11 – 15", "< 5.7", ">= 3", "up to 140", "0.3 to 3.0". */
export function parseRefRange(text: string | null | undefined): Range | null {
  if (!text) return null;
  const t = text.replace(/,/g, '').replace(/[–—]/g, '-').toLowerCase();
  const num = '(\\d+(?:\\.\\d+)?)';
  let m = new RegExp(`^\\s*${num}\\s*(?:-|to)\\s*${num}`).exec(t);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  m = new RegExp(`(?:<=?|up to|below|less than|upto)\\s*${num}`).exec(t);
  if (m) return { low: null, high: Number(m[1]) };
  m = new RegExp(`(?:>=?|above|more than|greater than)\\s*${num}`).exec(t);
  if (m) return { low: Number(m[1]), high: null };
  return null;
}

const normUnit = (u: string | null | undefined) => (u ?? '').toLowerCase().replace(/[\s.]/g, '').replace('µ', 'u');

export function unitsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  return normUnit(a) === normUnit(b);
}

export interface ResolvedRange extends Range {
  source: 'catalog' | 'report' | 'none';
}

/**
 * Reference range to use: the hospital catalog (trimester-specific when defined) when the
 * reported unit matches, otherwise the range printed on the report, otherwise none.
 */
export function resolveRange(
  test: LabTest | undefined,
  trimester: number | null,
  reportedUnit: string | null,
  reportRange: string | null,
): ResolvedRange {
  if (test && unitsCompatible(test.unit, reportedUnit)) {
    const tri = trimester ? test.trimester_ref?.[String(trimester)] : undefined;
    const low = tri ? (tri.low ?? null) : test.ref_low;
    const high = tri ? (tri.high ?? null) : test.ref_high;
    if (low !== null || high !== null) return { low, high, source: 'catalog' };
  }
  const printed = parseRefRange(reportRange);
  if (printed) return { ...printed, source: 'report' };
  return { low: null, high: null, source: 'none' };
}

const NEGATIVE = /\b(non[\s-]?reactive|negative|not detected|absent|nil|normal|no growth)\b|^-$/i;
const POSITIVE = /\b(reactive|positive|detected|present|trace)\b|\+/i;

export function computeFlag(value: number | null, text: string | null, range: Range): LabFlag | null {
  if (value !== null) {
    if (range.low !== null && value < range.low) return 'low';
    if (range.high !== null && value > range.high) return 'high';
    return range.low !== null || range.high !== null ? 'normal' : null;
  }
  if (text) {
    if (NEGATIVE.test(text)) return 'normal';
    if (POSITIVE.test(text)) return 'abnormal';
  }
  return null;
}

export interface LabResultInsert {
  report_id: string;
  pregnancy_id: string;
  test_code: string | null;
  raw_name: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: LabFlag | null;
  source: 'ai_extracted';
  confidence: number;
  verified: false;
  observed_on: string | null;
}

export interface ExtractedValue {
  raw_name: string;
  test_code: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_range_on_report: string | null;
  confidence: number;
}

/** Turns validated model values into unverified lab_results rows with mapped codes and flags. */
export function toLabResults(
  values: ExtractedValue[],
  ctx: { report_id: string; pregnancy_id: string; observed_on: string | null; trimester: number | null },
  catalog: LabTest[],
): { rows: LabResultInsert[]; values: ExtractedValue[] } {
  const rows: LabResultInsert[] = [];
  const mapped: ExtractedValue[] = [];
  for (const v of values) {
    const code = mapTestCode(v.raw_name, v.test_code, catalog);
    const test = catalog.find((t) => t.code === code);
    const range = resolveRange(test, ctx.trimester, v.unit, v.ref_range_on_report);
    rows.push({
      report_id: ctx.report_id,
      pregnancy_id: ctx.pregnancy_id,
      test_code: code,
      raw_name: v.raw_name,
      value_num: v.value,
      value_text: v.value_text,
      unit: v.unit ?? test?.unit ?? null,
      ref_low: range.low,
      ref_high: range.high,
      flag: computeFlag(v.value, v.value_text, range),
      source: 'ai_extracted',
      confidence: Math.round(v.confidence * 100) / 100,
      verified: false,
      observed_on: ctx.observed_on,
    });
    mapped.push({ ...v, test_code: code });
  }
  return { rows, values: mapped };
}
