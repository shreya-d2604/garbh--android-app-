// Consultation form (PLAN.md §7.4 #4): values, validation, vitals flags, DB mapping. Pure.
import { z } from 'zod';

import type { TablesInsert, TablesUpdate } from '@/types/database';

import { textOrNull } from './format';
import {
  isRowBlank,
  rowFromItem,
  validateRow,
  type PrescriptionFormRow,
} from './prescription';
import type { ConsultationRow, PrescriptionItemRow } from './types';

/** Plausible human ranges. Outside them the value is almost certainly a typo (BP 300/20). */
export const VITAL_RANGES = {
  weight_kg: { min: 30, max: 200 },
  bp_systolic: { min: 70, max: 250 },
  bp_diastolic: { min: 40, max: 150 },
  pulse: { min: 40, max: 200 },
  temperature: { min: 34, max: 42 },
  spo2: { min: 70, max: 100 },
  fundal_height_cm: { min: 5, max: 50 },
  fetal_heart_rate: { min: 90, max: 200 },
} as const;
export type VitalField = keyof typeof VITAL_RANGES;

export interface ConsultationFormValues {
  weight_kg: string;
  bp_systolic: string;
  bp_diastolic: string;
  pulse: string;
  temperature: string;
  spo2: string;
  fundal_height_cm: string;
  fetal_heart_rate: string;
  presentation: string;
  fetal_movements: string;
  edema: string;
  urine_albumin: string;
  urine_sugar: string;
  complaints: string;
  findings: string;
  advice: string;
  diet_advice: string;
  next_visit_after_weeks: string;
  private_note: string;
  prescriptions: PrescriptionFormRow[];
}

export function emptyConsultationValues(): ConsultationFormValues {
  return {
    weight_kg: '',
    bp_systolic: '',
    bp_diastolic: '',
    pulse: '',
    temperature: '',
    spo2: '',
    fundal_height_cm: '',
    fetal_heart_rate: '',
    presentation: '',
    fetal_movements: '',
    edema: '',
    urine_albumin: '',
    urine_sugar: '',
    complaints: '',
    findings: '',
    advice: '',
    diet_advice: '',
    next_visit_after_weeks: '',
    private_note: '',
    prescriptions: [],
  };
}

const NUMBER_RE = /^\d+([.,]\d+)?$/;

/** '' -> null; a valid non-negative number -> number; anything else -> NaN. */
export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  if (!NUMBER_RE.test(t)) return Number.NaN;
  return Number(t.replace(',', '.'));
}

function vitalIssue(field: VitalField, text: string): boolean {
  const n = parseNumber(text);
  if (n === null) return false;
  const { min, max } = VITAL_RANGES[field];
  return Number.isNaN(n) || n < min || n > max;
}

const vital = (field: VitalField) =>
  z.string().refine((v) => !vitalIssue(field, v), { error: `doctor:validation.range.${field}` });

const prescriptionRowSchema = z
  .object({
    key: z.string(),
    id: z.string().nullable(),
    drug_name: z.string(),
    strength: z.string(),
    dosage_form: z.string(),
    dose: z.string(),
    frequency: z.string(),
    timing: z.string(),
    route: z.string(),
    duration_days: z.string(),
    start_date: z.string(),
    instructions: z.string(),
  })
  .superRefine((row, ctx) => {
    for (const [field, key] of Object.entries(validateRow(row))) {
      ctx.addIssue({ code: 'custom', message: `doctor:${key}`, path: [field] });
    }
  });

export const consultationSchema = z
  .object({
    weight_kg: vital('weight_kg'),
    bp_systolic: vital('bp_systolic'),
    bp_diastolic: vital('bp_diastolic'),
    pulse: vital('pulse'),
    temperature: vital('temperature'),
    spo2: vital('spo2'),
    fundal_height_cm: vital('fundal_height_cm'),
    fetal_heart_rate: vital('fetal_heart_rate'),
    presentation: z.string(),
    fetal_movements: z.string(),
    edema: z.string(),
    urine_albumin: z.string(),
    urine_sugar: z.string(),
    complaints: z.string(),
    findings: z.string(),
    advice: z.string(),
    diet_advice: z.string(),
    next_visit_after_weeks: z
      .string()
      .refine((v) => v.trim() === '' || (/^\d{1,2}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 40), {
        error: 'doctor:validation.nextVisit',
      }),
    private_note: z.string(),
    prescriptions: z.array(prescriptionRowSchema),
  })
  .superRefine((v, ctx) => {
    const sys = parseNumber(v.bp_systolic);
    const dia = parseNumber(v.bp_diastolic);
    if (sys !== null && dia !== null && !Number.isNaN(sys) && !Number.isNaN(dia) && sys <= dia) {
      ctx.addIssue({ code: 'custom', message: 'doctor:validation.bpOrder', path: ['bp_diastolic'] });
    }
  });

/** Clinically abnormal (but possible) readings, shown as chips. Typos are caught by the schema. */
export type VitalWarning = 'bp_high' | 'bp_low' | 'fever' | 'spo2_low' | 'fhr_abnormal' | 'pulse_abnormal';

export function vitalWarnings(values: Pick<ConsultationFormValues, VitalField>): VitalWarning[] {
  const num = (f: VitalField) => {
    const n = parseNumber(values[f]);
    return n === null || Number.isNaN(n) || vitalIssue(f, values[f]) ? null : n;
  };
  const out: VitalWarning[] = [];
  const sys = num('bp_systolic');
  const dia = num('bp_diastolic');
  if ((sys !== null && sys >= 140) || (dia !== null && dia >= 90)) out.push('bp_high');
  else if ((sys !== null && sys < 90) || (dia !== null && dia < 60)) out.push('bp_low');
  const temp = num('temperature');
  if (temp !== null && temp >= 38) out.push('fever');
  const spo2 = num('spo2');
  if (spo2 !== null && spo2 < 95) out.push('spo2_low');
  const fhr = num('fetal_heart_rate');
  if (fhr !== null && (fhr < 110 || fhr > 160)) out.push('fhr_abnormal');
  const pulse = num('pulse');
  if (pulse !== null && (pulse < 50 || pulse > 100)) out.push('pulse_abnormal');
  return out;
}

/** Vital fields whose current text is outside the plausible range (blocks publishing). */
export function implausibleVitals(values: Pick<ConsultationFormValues, VitalField>): VitalField[] {
  return (Object.keys(VITAL_RANGES) as VitalField[]).filter((f) => vitalIssue(f, values[f]));
}

/** i18n keys (namespace doctor) of reasons why this consultation cannot be published yet. */
export function publishIssues(values: ConsultationFormValues): string[] {
  const issues: string[] = [];
  const parsed = consultationSchema.safeParse(values);
  if (!parsed.success) issues.push('publish.fixErrors');
  const rows = values.prescriptions.filter((r) => !isRowBlank(r));
  const hasContent =
    values.advice.trim() !== '' || values.diet_advice.trim() !== '' || rows.length > 0;
  if (!hasContent) issues.push('publish.needContent');
  return issues;
}

/** Number for a vital field: undefined when the text is invalid (left out of the autosave). */
function vitalNumber(field: VitalField, text: string): number | null | undefined {
  const n = parseNumber(text);
  if (n === null) return null;
  return vitalIssue(field, text) ? undefined : n;
}

type ConsultationColumns = Omit<
  TablesUpdate<'consultations'>,
  'id' | 'created_at' | 'updated_at' | 'doctor_id' | 'pregnancy_id' | 'appointment_id' | 'published_at'
>;

/** Columns to save. Fields with an invalid value are omitted so a draft never fails a DB check. */
export function toConsultationColumns(values: ConsultationFormValues): ConsultationColumns {
  const cols: ConsultationColumns = {
    presentation: textOrNull(values.presentation),
    fetal_movements: textOrNull(values.fetal_movements),
    edema: textOrNull(values.edema),
    urine_albumin: textOrNull(values.urine_albumin),
    urine_sugar: textOrNull(values.urine_sugar),
    complaints: textOrNull(values.complaints),
    findings: textOrNull(values.findings),
    advice: textOrNull(values.advice),
    diet_advice: textOrNull(values.diet_advice),
  };
  const set = <K extends VitalField>(field: K, value: number | null | undefined) => {
    if (value !== undefined) (cols as Record<string, unknown>)[field] = value;
  };
  for (const f of Object.keys(VITAL_RANGES) as VitalField[]) set(f, vitalNumber(f, values[f]));
  const weeks = values.next_visit_after_weeks.trim();
  if (weeks === '') cols.next_visit_after_weeks = null;
  else if (/^\d{1,2}$/.test(weeks) && Number(weeks) >= 1 && Number(weeks) <= 40)
    cols.next_visit_after_weeks = Number(weeks);
  return cols;
}

export function toConsultationInsert(
  values: ConsultationFormValues,
  ctx: {
    id: string;
    pregnancyId: string;
    doctorId: string;
    appointmentId: string | null;
    ga: { weeks: number; days: number } | null;
  },
): TablesInsert<'consultations'> {
  return {
    ...toConsultationColumns(values),
    id: ctx.id,
    pregnancy_id: ctx.pregnancyId,
    doctor_id: ctx.doctorId,
    appointment_id: ctx.appointmentId,
    ga_weeks: ctx.ga?.weeks ?? null,
    ga_days: ctx.ga?.days ?? null,
  };
}

const str = (n: number | string | null | undefined) => (n == null ? '' : String(n));

export function valuesFromConsultation(
  row: ConsultationRow | null,
  privateNote: string | null,
  items: readonly PrescriptionItemRow[],
): ConsultationFormValues {
  if (!row) return emptyConsultationValues();
  return {
    weight_kg: str(row.weight_kg),
    bp_systolic: str(row.bp_systolic),
    bp_diastolic: str(row.bp_diastolic),
    pulse: str(row.pulse),
    temperature: str(row.temperature),
    spo2: str(row.spo2),
    fundal_height_cm: str(row.fundal_height_cm),
    fetal_heart_rate: str(row.fetal_heart_rate),
    presentation: str(row.presentation),
    fetal_movements: str(row.fetal_movements),
    edema: str(row.edema),
    urine_albumin: str(row.urine_albumin),
    urine_sugar: str(row.urine_sugar),
    complaints: str(row.complaints),
    findings: str(row.findings),
    advice: str(row.advice),
    diet_advice: str(row.diet_advice),
    next_visit_after_weeks: str(row.next_visit_after_weeks),
    private_note: privateNote ?? '',
    prescriptions: items.map(rowFromItem),
  };
}
