// Form schemas for the reception screens. Error messages are i18n keys (FormField translates them).
import { z } from 'zod';

import { diffDays, isISODate, lmpFromEdd, todayISO, type ISODate } from '@/domain/pregnancy-math';
import { splitList } from '@/domain/schemas/onboarding';

// Same window the server enforces in register_patient(): LMP within the last 300 days, not in the future.
const MAX_LMP_AGE_DAYS = 300;

const isoDate = z.string().refine(isISODate, { error: 'validation.date' });
const optionalText = z.string().trim().optional();
const phone = z.string().trim().regex(/^\+?[0-9 ]{10,15}$/, { error: 'validation.phone' });

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export function registerPatientSchema(today: ISODate = todayISO()) {
  return z
    .object({
      full_name: z.string().trim().min(2, { error: 'validation.required' }),
      phone,
      email: z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.email({ error: 'validation.email' }))
        .optional()
        .or(z.literal('')),
      dob: isoDate,
      address: optionalText,
      mrn: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9-]{3,20}$/, { error: 'reception:validation.mrn' })
        .optional()
        .or(z.literal('')),
      blood_group: z.enum(BLOOD_GROUPS).optional().or(z.literal('')),
      allergies: optionalText,
      chronic_conditions: optionalText,
      emergency_contact: optionalText,
      date_kind: z.enum(['lmp', 'edd']),
      date: isoDate,
      first_pregnancy: z.boolean(),
      primary_doctor: z.string().min(1, { error: 'reception:validation.doctor' }),
      consent: z.literal(true, { error: 'reception:validation.consent' }),
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

export type RegisterPatientForm = z.input<ReturnType<typeof registerPatientSchema>>;

/** The p_details payload of register_patient(). Blank optional fields are omitted. */
export function toRegisterDetails(v: RegisterPatientForm) {
  const text = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);
  return {
    full_name: v.full_name.trim(),
    phone: v.phone.trim(),
    email: text(v.email),
    dob: v.dob,
    address: text(v.address),
    mrn: text(v.mrn),
    blood_group: text(v.blood_group),
    allergies: splitList(v.allergies),
    chronic_conditions: splitList(v.chronic_conditions),
    emergency_contact: text(v.emergency_contact),
    ...(v.date_kind === 'lmp' ? { lmp_date: v.date } : { edd_date: v.date }),
    ...(v.first_pregnancy ? { gravida: 1, para: 0, abortus: 0, living: 0 } : {}),
    primary_doctor: v.primary_doctor,
    consent: v.consent === true,
  };
}

/** Editable demographics on the verify screen (a subset of the patients row). */
export const patientDetailsEditSchema = z.object({
  full_name: z.string().trim().min(2, { error: 'validation.required' }),
  phone: phone.optional().or(z.literal('')),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'validation.email' }))
    .optional()
    .or(z.literal('')),
  dob: isoDate.optional().or(z.literal('')),
  address: optionalText,
});
export type PatientDetailsEditForm = z.input<typeof patientDetailsEditSchema>;

export const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });
