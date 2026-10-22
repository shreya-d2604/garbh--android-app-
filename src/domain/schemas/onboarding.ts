import { z } from 'zod';

import {
  addDays,
  diffDays,
  isISODate,
  lmpFromEdd,
  todayISO,
  type ISODate,
} from '../pregnancy-math';

// Mirrors the server checks in complete_signup(): LMP within the last 300 days, not in the future.
const MAX_LMP_AGE_DAYS = 300;

const isoDate = z.string().refine(isISODate, { error: 'validation.date' });
const optionalText = z.string().trim().optional();

/** Comma/newline separated free text -> clean string array. */
export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function patientDetailsSchema(today: ISODate = todayISO()) {
  return z
    .object({
      full_name: z.string().trim().min(2, { error: 'validation.required' }),
      dob: isoDate.optional(),
      phone: z
        .string()
        .trim()
        .regex(/^\+?[0-9 ]{10,15}$/, { error: 'validation.phone' })
        .optional()
        .or(z.literal('')),
      date_kind: z.enum(['lmp', 'edd']),
      date: isoDate,
      first_pregnancy: z.boolean(),
      allergies: optionalText,
      chronic_conditions: optionalText,
    })
    .refine(
      (v) => {
        if (!isISODate(v.date)) return true; // reported by the field itself
        const lmp = v.date_kind === 'lmp' ? v.date : lmpFromEdd(v.date);
        const age = diffDays(today, lmp);
        return age >= 0 && age <= MAX_LMP_AGE_DAYS;
      },
      { error: 'validation.pregnancyDate', path: ['date'] },
    );
}

export type PatientDetailsForm = z.input<ReturnType<typeof patientDetailsSchema>>;

/** Builds the p_details payload for complete_signup('patient', ...). */
export function toCompleteSignupDetails(v: PatientDetailsForm) {
  return {
    full_name: v.full_name.trim(),
    dob: v.dob || null,
    phone: v.phone?.trim() || null,
    ...(v.date_kind === 'lmp' ? { lmp_date: v.date } : { edd_date: v.date }),
    ...(v.first_pregnancy ? { gravida: 1, para: 0, abortus: 0, living: 0 } : {}),
    allergies: splitList(v.allergies),
    chronic_conditions: splitList(v.chronic_conditions),
  };
}

/** Earliest/latest selectable dates for the date picker. */
export function pregnancyDateBounds(kind: 'lmp' | 'edd', today: ISODate = todayISO()) {
  return kind === 'lmp'
    ? { min: addDays(today, -MAX_LMP_AGE_DAYS), max: today }
    : { min: addDays(today, 280 - MAX_LMP_AGE_DAYS), max: addDays(today, 280) };
}
