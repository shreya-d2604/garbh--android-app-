// De-identified context for the AI (PLAN.md §9.2).
// SENT: age in years, GA weeks+days, trimester, G/P/A/L, risk factors, allergies, chronic
//       conditions, current active prescription items, last 3 values of key labs, report type.
// NEVER SENT: name, MRN, phone, email, address, doctor names.
// The builder copies a fixed whitelist of fields into a NEW object, so extra columns on the
// input rows can never leak. Free text (complaints, advice...) is scrubbed of the patient's own
// identifiers, and assertDeidentified() is a last check on the exact payload before it leaves.

export const KEY_LABS = ['HB', 'PLT', 'TSH', 'FBS', 'PPBS', 'OGTT_2H', 'HBA1C'] as const;

export interface PatientSource {
  dob: string | null;
  allergies: string[];
  chronic_conditions: string[];
  // Identifiers: used only to scrub free text and to verify the payload; never copied out.
  full_name?: string | null;
  mrn?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface PregnancySource {
  edd_final: string | null;
  gravida: number | null;
  para: number | null;
  abortus: number | null;
  living: number | null;
  multiple_gestation: number;
  risk_level: string;
  risk_factors: string[];
}

export interface MedicationSource {
  drug_name: string;
  strength: string | null;
  dose: string | null;
  frequency: string | null;
  timing: string | null;
}

export interface LabHistoryRow {
  test_code: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  observed_on: string | null;
}

export interface ConsultationSource {
  ga_weeks: number | null;
  ga_days: number | null;
  weight_kg: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  pulse: number | null;
  temperature: number | null;
  spo2: number | null;
  fundal_height_cm: number | null;
  fetal_heart_rate: number | null;
  presentation: string | null;
  fetal_movements: string | null;
  edema: string | null;
  urine_albumin: string | null;
  urine_sugar: string | null;
  complaints: string | null;
  findings: string | null;
  advice: string | null;
  diet_advice: string | null;
  next_visit_after_weeks: number | null;
}

export interface ContextSource {
  patient: PatientSource;
  pregnancy: PregnancySource;
  medications: MedicationSource[];
  labs: LabHistoryRow[];
  /** Hospital "today" as YYYY-MM-DD. */
  today: string;
  /** Names of doctors involved, used only for scrubbing free text. */
  doctor_names?: string[];
}

export interface DeidentifiedContext {
  age_years: number | null;
  gestational_age: { weeks: number; days: number; trimester: 1 | 2 | 3 } | null;
  gpal: { gravida: number | null; para: number | null; abortus: number | null; living: number | null };
  multiple_gestation: number;
  risk_level: string;
  risk_factors: string[];
  allergies: string[];
  chronic_conditions: string[];
  active_medications: { drug_name: string; strength: string | null; dose: string | null; frequency: string | null; timing: string | null }[];
  recent_labs: Record<string, { value: number | string | null; unit: string | null; observed_on: string | null }[]>;
  consultation?: Record<string, number | string | null>;
}

const DAY_MS = 86_400_000;
const toDay = (iso: string): number => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS;

/** Whole years between two YYYY-MM-DD dates. */
export function ageYears(dob: string | null, today: string): number | null {
  if (!dob) return null;
  let age = +today.slice(0, 4) - +dob.slice(0, 4);
  if (today.slice(5) < dob.slice(5)) age -= 1;
  return age >= 0 ? age : null;
}

/** Mirrors SQL ga_from_edd(): GA days = today - (edd - 280); trimester <14w:1, <28w:2, else 3. */
export function gaFromEdd(edd: string | null, today: string) {
  if (!edd) return null;
  const days = toDay(today) - (toDay(edd) - 280);
  const weeks = Math.floor(days / 7);
  const trimester = weeks < 14 ? 1 : weeks < 28 ? 2 : 3;
  return { weeks, days: days - weeks * 7, trimester } as const;
}

export function identifiersOf(
  patient: Pick<PatientSource, 'full_name' | 'mrn' | 'phone' | 'email' | 'address'>,
  doctorNames: string[] = [],
): string[] {
  const out = new Set<string>();
  const add = (s: string | null | undefined, min = 1) => {
    const v = s?.trim();
    if (v && v.length >= min) out.add(v);
  };
  add(patient.full_name);
  add(patient.mrn);
  add(patient.email);
  add(patient.phone);
  add(patient.address);
  // Individual name parts catch "Priya" / "Mrs. Sharma" in free text; short parts are too noisy.
  for (const name of [patient.full_name, ...doctorNames]) {
    add(name);
    for (const part of (name ?? '').split(/[\s.,]+/)) add(part, 4);
  }
  // Phone numbers appear with and without spaces/country code.
  const digits = patient.phone?.replace(/\D/g, '');
  if (digits && digits.length >= 7) out.add(digits.slice(-10));
  return [...out];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Redacts every identifier (case-insensitive) from free text. */
export function scrubText(text: string | null | undefined, identifiers: string[]): string | null {
  if (text == null) return null;
  let out = text;
  for (const id of [...identifiers].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRe(id), 'gi'), '[removed]');
  }
  return out;
}

/** Throws if the serialised payload still contains any identifier. Last line of defence. */
export function assertDeidentified(payload: unknown, identifiers: string[]): void {
  const hay = JSON.stringify(payload).toLowerCase();
  for (const id of identifiers) {
    if (id.length >= 4 && hay.includes(id.toLowerCase())) {
      throw new Error('PII_LEAK');
    }
  }
}

function lastValues(labs: LabHistoryRow[]): DeidentifiedContext['recent_labs'] {
  const byCode: DeidentifiedContext['recent_labs'] = {};
  const sorted = [...labs].sort((a, b) => (b.observed_on ?? '').localeCompare(a.observed_on ?? ''));
  for (const l of sorted) {
    if (!(KEY_LABS as readonly string[]).includes(l.test_code)) continue;
    const list = (byCode[l.test_code] ??= []);
    if (list.length < 3) list.push({ value: l.value_num ?? l.value_text, unit: l.unit, observed_on: l.observed_on });
  }
  return byCode;
}

export function buildContext(src: ContextSource, consultation?: ConsultationSource | null): DeidentifiedContext {
  const ids = identifiersOf(src.patient, src.doctor_names);
  const ctx: DeidentifiedContext = {
    age_years: ageYears(src.patient.dob, src.today),
    gestational_age: gaFromEdd(src.pregnancy.edd_final, src.today),
    gpal: {
      gravida: src.pregnancy.gravida,
      para: src.pregnancy.para,
      abortus: src.pregnancy.abortus,
      living: src.pregnancy.living,
    },
    multiple_gestation: src.pregnancy.multiple_gestation,
    risk_level: src.pregnancy.risk_level,
    risk_factors: [...src.pregnancy.risk_factors],
    allergies: [...src.patient.allergies],
    chronic_conditions: [...src.patient.chronic_conditions],
    active_medications: src.medications.map((m) => ({
      drug_name: m.drug_name,
      strength: m.strength,
      dose: m.dose,
      frequency: m.frequency,
      timing: m.timing,
    })),
    recent_labs: lastValues(src.labs),
  };
  if (consultation) {
    const c = consultation;
    ctx.consultation = {
      ga_weeks: c.ga_weeks,
      ga_days: c.ga_days,
      weight_kg: c.weight_kg,
      bp_systolic: c.bp_systolic,
      bp_diastolic: c.bp_diastolic,
      pulse: c.pulse,
      temperature: c.temperature,
      spo2: c.spo2,
      fundal_height_cm: c.fundal_height_cm,
      fetal_heart_rate: c.fetal_heart_rate,
      presentation: scrubText(c.presentation, ids),
      fetal_movements: scrubText(c.fetal_movements, ids),
      edema: scrubText(c.edema, ids),
      urine_albumin: scrubText(c.urine_albumin, ids),
      urine_sugar: scrubText(c.urine_sugar, ids),
      complaints: scrubText(c.complaints, ids),
      findings: scrubText(c.findings, ids),
      advice: scrubText(c.advice, ids),
      diet_advice: scrubText(c.diet_advice, ids),
      next_visit_after_weeks: c.next_visit_after_weeks,
    };
  }
  // Free-text clinical lists are scrubbed too (a patient's name can end up in risk_factors).
  ctx.risk_factors = ctx.risk_factors.map((s) => scrubText(s, ids) ?? '');
  ctx.allergies = ctx.allergies.map((s) => scrubText(s, ids) ?? '');
  ctx.chronic_conditions = ctx.chronic_conditions.map((s) => scrubText(s, ids) ?? '');
  assertDeidentified(ctx, ids);
  return ctx;
}
