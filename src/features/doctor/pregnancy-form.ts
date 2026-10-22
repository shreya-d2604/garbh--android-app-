// Pregnancy management form (PLAN.md §7.4 #8): dating, risk, obstetric history, medical info, outcome. Pure.
import { z } from 'zod';

import { addDays, eddFinal, isISODate, type ISODate } from '@/domain/pregnancy-math';
import type { TablesUpdate } from '@/types/database';

import { joinList, parseList, textOrNull } from './format';
import type { PatientRow, PregnancyRow, PregnancyStatus } from './types';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const CLOSING_STATUSES: readonly PregnancyStatus[] = [
  'delivered',
  'miscarriage',
  'terminated',
  'transferred',
  'closed',
];

export interface PregnancyFormValues {
  lmp_date: string;
  edd_usg: string;
  /** The doctor confirms the dates with the patient: switches lmp_source to 'clinician'. */
  confirmed: boolean;
  risk_level: 'low' | 'moderate' | 'high';
  risk_factors: string;
  gravida: string;
  para: string;
  abortus: string;
  living: string;
  multiple_gestation: string;
  blood_group: string;
  rh_negative: boolean;
  allergies: string;
  chronic_conditions: string;
}

export function pregnancyDefaults(
  p: Pick<
    PregnancyRow,
    'lmp_date' | 'edd_usg' | 'lmp_source' | 'risk_level' | 'risk_factors' | 'gravida' | 'para' | 'abortus' | 'living' | 'multiple_gestation'
  >,
  patient: Pick<PatientRow, 'blood_group' | 'rh_negative' | 'allergies' | 'chronic_conditions'>,
): PregnancyFormValues {
  const n = (v: number | null) => (v == null ? '' : String(v));
  return {
    lmp_date: p.lmp_date ?? '',
    edd_usg: p.edd_usg ?? '',
    confirmed: p.lmp_source === 'clinician',
    risk_level: p.risk_level,
    risk_factors: joinList(p.risk_factors),
    gravida: n(p.gravida),
    para: n(p.para),
    abortus: n(p.abortus),
    living: n(p.living),
    multiple_gestation: String(p.multiple_gestation),
    blood_group: patient.blood_group ?? '',
    rh_negative: patient.rh_negative ?? false,
    allergies: joinList(patient.allergies),
    chronic_conditions: joinList(patient.chronic_conditions),
  };
}

const count = (key: string) =>
  z.string().refine((v) => v.trim() === '' || (/^\d{1,2}$/.test(v.trim()) && Number(v) <= 20), { error: key });

export function pregnancyFormSchema(today: ISODate) {
  return z
    .object({
      lmp_date: z.string().refine((v) => v === '' || isISODate(v), { error: 'validation.date' }),
      edd_usg: z.string().refine((v) => v === '' || isISODate(v), { error: 'validation.date' }),
      confirmed: z.boolean(),
      risk_level: z.enum(['low', 'moderate', 'high']),
      risk_factors: z.string(),
      gravida: count('doctor:validation.count'),
      para: count('doctor:validation.count'),
      abortus: count('doctor:validation.count'),
      living: count('doctor:validation.count'),
      multiple_gestation: z.string().refine((v) => /^[1-6]$/.test(v.trim()), { error: 'doctor:validation.multiple' }),
      blood_group: z.string().refine((v) => v === '' || (BLOOD_GROUPS as readonly string[]).includes(v), { error: 'validation.required' }),
      rh_negative: z.boolean(),
      allergies: z.string(),
      chronic_conditions: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.lmp_date === '' && v.edd_usg === '') {
        ctx.addIssue({ code: 'custom', message: 'doctor:validation.needDates', path: ['lmp_date'] });
      }
      if (v.lmp_date !== '' && isISODate(v.lmp_date)) {
        if (v.lmp_date > today) ctx.addIssue({ code: 'custom', message: 'doctor:validation.lmpFuture', path: ['lmp_date'] });
        else if (v.lmp_date < addDays(today, -300))
          ctx.addIssue({ code: 'custom', message: 'doctor:validation.lmpOld', path: ['lmp_date'] });
      }
      if (v.edd_usg !== '' && isISODate(v.edd_usg)) {
        if (v.edd_usg < addDays(today, -60) || v.edd_usg > addDays(today, 300))
          ctx.addIssue({ code: 'custom', message: 'doctor:validation.eddRange', path: ['edd_usg'] });
      }
    });
}

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export function toPregnancyPatch(
  v: PregnancyFormValues,
  initial: PregnancyFormValues,
): Pick<
  TablesUpdate<'pregnancies'>,
  | 'lmp_date'
  | 'edd_usg'
  | 'lmp_source'
  | 'risk_level'
  | 'risk_factors'
  | 'gravida'
  | 'para'
  | 'abortus'
  | 'living'
  | 'multiple_gestation'
> {
  const datesChanged = v.lmp_date !== initial.lmp_date || v.edd_usg !== initial.edd_usg;
  return {
    lmp_date: textOrNull(v.lmp_date),
    edd_usg: textOrNull(v.edd_usg),
    // Any date the doctor sets or confirms is clinician-verified (PLAN.md §8.3).
    ...(v.confirmed || datesChanged ? { lmp_source: 'clinician' as const } : {}),
    risk_level: v.risk_level,
    risk_factors: parseList(v.risk_factors),
    gravida: num(v.gravida),
    para: num(v.para),
    abortus: num(v.abortus),
    living: num(v.living),
    multiple_gestation: Number(v.multiple_gestation),
  };
}

export function toMedicalPatch(v: PregnancyFormValues) {
  return {
    blood_group: textOrNull(v.blood_group),
    rh_negative: v.rh_negative,
    allergies: parseList(v.allergies),
    chronic_conditions: parseList(v.chronic_conditions),
  };
}

/** The due date the form would produce (preview), or null. */
export function previewEdd(v: Pick<PregnancyFormValues, 'lmp_date' | 'edd_usg'>): ISODate | null {
  return eddFinal(isISODate(v.lmp_date) ? v.lmp_date : null, isISODate(v.edd_usg) ? v.edd_usg : null);
}

/** Closing a pregnancy needs a closing status and a date that is not in the future. */
export const outcomeSchema = (today: ISODate) =>
  z.object({
    status: z.enum(['delivered', 'miscarriage', 'terminated', 'transferred', 'closed']),
    outcome_date: z.string().refine((v) => isISODate(v) && v <= today, { error: 'validation.date' }),
    outcome_notes: z.string(),
  });
export type OutcomeValues = z.infer<ReturnType<typeof outcomeSchema>>;
