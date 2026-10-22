// Form schemas for the admin screens. Error messages are i18n keys: FormField translates them in
// the 'common' namespace unless they carry a namespace prefix ('admin:validation.reason').
import { z } from 'zod';

import { diffDays, isISODate, todayISO, type ISODate } from '@/domain/pregnancy-math';

import { blankToNull, splitList } from './format';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const RISK_LEVELS = ['low', 'moderate', 'high'] as const;
export const PREGNANCY_STATUSES = [
  'active',
  'delivered',
  'miscarriage',
  'terminated',
  'transferred',
  'closed',
] as const;
/** Mirrors the SQL check in complete_signup / admin_create_patient. */
export const MAX_LMP_AGE_DAYS = 300;

const isoDate = z.string().refine(isISODate, { error: 'validation.date' });
const optionalDate = z.union([z.literal(''), isoDate]).optional();
const optionalPhone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ]{10,15}$/, { error: 'validation.phone' })
  .optional()
  .or(z.literal(''));
const text = (max: number) =>
  z.string().trim().max(max, { error: 'admin:validation.tooLong' }).optional();
const name = z
  .string()
  .trim()
  .min(2, { error: 'validation.required' })
  .max(100, { error: 'admin:validation.tooLong' });

export const reasonSchema = (min = 3) =>
  z.object({ reason: z.string().trim().min(min, { error: 'admin:validation.reason' }) });
export type ReasonForm = z.input<ReturnType<typeof reasonSchema>>;

// ---------------------------------------------------------------- staff
export const staffCreateSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'validation.email' })),
  full_name: name,
  role: z.enum(['doctor', 'receptionist', 'admin']),
  phone: optionalPhone,
  designation: text(100),
  specialization: text(100),
  registration_no: text(50),
  bio: text(1000),
});
export type StaffCreateForm = z.input<typeof staffCreateSchema>;

export const staffEditSchema = staffCreateSchema.omit({ email: true, role: true });
export type StaffEditForm = z.input<typeof staffEditSchema>;

/** Body fields for the admin-users function: blank optional text becomes null (cleared). */
export function toStaffPayload(v: StaffEditForm) {
  return {
    full_name: v.full_name.trim(),
    phone: blankToNull(v.phone),
    designation: blankToNull(v.designation),
    specialization: blankToNull(v.specialization),
    registration_no: blankToNull(v.registration_no),
    bio: blankToNull(v.bio),
  };
}

// ---------------------------------------------------------------- patients
const patientShape = {
  full_name: name,
  mrn: z
    .string()
    .trim()
    .min(1, { error: 'validation.required' })
    .max(30, { error: 'admin:validation.tooLong' }),
  dob: optionalDate,
  phone: optionalPhone,
  email: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .toLowerCase()
        .pipe(z.email({ error: 'validation.email' })),
    ])
    .optional(),
  address: text(300),
  blood_group: z.union([z.literal(''), z.enum(BLOOD_GROUPS)]).optional(),
  rh_negative: z.boolean(),
  allergies: text(500),
  chronic_conditions: text(500),
  emergency_contact: text(200),
};

export const patientSchema = z.object(patientShape);
export type PatientForm = z.input<typeof patientSchema>;

/** Columns for `update public.patients` from the form. */
export function toPatientUpdate(v: PatientForm) {
  return {
    full_name: v.full_name.trim(),
    mrn: v.mrn.trim(),
    dob: blankToNull(v.dob),
    phone: blankToNull(v.phone),
    email: blankToNull(v.email)?.toLowerCase() ?? null,
    address: blankToNull(v.address),
    blood_group: blankToNull(v.blood_group),
    rh_negative: v.rh_negative,
    allergies: splitList(v.allergies),
    chronic_conditions: splitList(v.chronic_conditions),
    emergency_contact: blankToNull(v.emergency_contact),
  };
}

export function newPatientSchema(today: ISODate = todayISO()) {
  return z
    .object({
      ...patientShape,
      lmp_date: optionalDate,
      primary_doctor: z.string().optional(),
    })
    .refine((v) => !v.lmp_date || (isISODate(v.lmp_date) && lmpAgeOk(v.lmp_date, today)), {
      error: 'validation.pregnancyDate',
      path: ['lmp_date'],
    })
    .refine((v) => !v.primary_doctor || !!v.lmp_date, {
      error: 'admin:validation.doctorNeedsLmp',
      path: ['lmp_date'],
    });
}
export type NewPatientForm = z.input<ReturnType<typeof newPatientSchema>>;

/** p_details for admin_create_patient. */
export function toCreatePatientDetails(v: NewPatientForm) {
  return {
    full_name: v.full_name.trim(),
    mrn: v.mrn.trim(),
    dob: blankToNull(v.dob),
    phone: blankToNull(v.phone),
    email: blankToNull(v.email),
    address: blankToNull(v.address),
    blood_group: blankToNull(v.blood_group),
    lmp_date: blankToNull(v.lmp_date),
    primary_doctor: blankToNull(v.primary_doctor),
  };
}

// ---------------------------------------------------------------- pregnancies
export function lmpAgeOk(lmp: ISODate, today: ISODate = todayISO()): boolean {
  const age = diffDays(today, lmp);
  return age >= 0 && age <= MAX_LMP_AGE_DAYS;
}

/** Fix LMP / dating-scan EDD (admin_update_pregnancy_dates). `active` = the pregnancy is still active. */
export function pregnancyDatesSchema(today: ISODate = todayISO(), active = true) {
  return z
    .object({
      lmp_date: optionalDate,
      edd_usg: optionalDate,
      reason: z.string().trim().min(3, { error: 'admin:validation.reason' }),
    })
    .refine((v) => !!v.lmp_date || !!v.edd_usg, {
      error: 'admin:validation.needDate',
      path: ['lmp_date'],
    })
    .refine(
      (v) => {
        if (!v.lmp_date) return true;
        const age = diffDays(today, v.lmp_date);
        return age >= 0 && (!active || age <= MAX_LMP_AGE_DAYS);
      },
      { error: 'validation.pregnancyDate', path: ['lmp_date'] },
    )
    .refine(
      (v) => {
        if (!v.edd_usg || !active) return true;
        const toEdd = diffDays(v.edd_usg, today);
        return toEdd >= -14 && toEdd <= 294;
      },
      { error: 'validation.pregnancyDate', path: ['edd_usg'] },
    );
}
export type PregnancyDatesForm = z.input<ReturnType<typeof pregnancyDatesSchema>>;

export const pregnancyStatusSchema = z.object({
  risk_level: z.enum(RISK_LEVELS),
  risk_factors: text(500),
  status: z.enum(PREGNANCY_STATUSES),
  outcome_date: optionalDate,
  outcome_notes: text(500),
});
export type PregnancyStatusForm = z.input<typeof pregnancyStatusSchema>;

export function toPregnancyStatusUpdate(v: PregnancyStatusForm) {
  const closed = v.status !== 'active';
  return {
    risk_level: v.risk_level,
    risk_factors: splitList(v.risk_factors),
    status: v.status,
    outcome_date: closed ? blankToNull(v.outcome_date) : null,
    outcome_notes: closed ? blankToNull(v.outcome_notes) : null,
  };
}

export function newPregnancySchema(today: ISODate = todayISO()) {
  return z.object({
    lmp_date: isoDate.refine((d) => lmpAgeOk(d, today), { error: 'validation.pregnancyDate' }),
  });
}

// ---------------------------------------------------------------- care team
export const backupNoteSchema = z.object({ note: text(200) });

// ---------------------------------------------------------------- profile (every role)
export const profileSchema = z.object({ full_name: name, phone: optionalPhone });
export type ProfileForm = z.input<typeof profileSchema>;

// ---------------------------------------------------------------- data-quality fix: vitals
const optionalNumber = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, { error: 'admin:validation.number' })
  .optional()
  .or(z.literal(''));
export const vitalsSchema = z.object({
  bp_systolic: optionalNumber,
  bp_diastolic: optionalNumber,
  pulse: optionalNumber,
  temperature: optionalNumber,
  spo2: optionalNumber,
  weight_kg: optionalNumber,
  fetal_heart_rate: optionalNumber,
  fundal_height_cm: optionalNumber,
});
export type VitalsForm = z.input<typeof vitalsSchema>;
