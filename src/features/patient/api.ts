// Supabase access for the patient area. Reads go through RLS (head's policies); writes to
// appointments only ever use the booking RPCs (docs/contracts.md §2).
import { rpcErrorCode, type RpcErrorCode } from '@/domain/rpc-errors';
import { supabase } from '@/lib/supabase';

import type {
  Appointment,
  CareTeamMember,
  Consultation,
  DoctorEntry,
  GuidanceRow,
  LabResult,
  LabTest,
  Milestone,
  PatientContext,
  PrescriptionItem,
  PublishedSummary,
  Report,
  ReportFile,
  Slot,
  Visit,
  WeekContent,
} from './types';

/** An error from a query or RPC. `code` is the UPPER_SNAKE contract code when there is one. */
export class ApiError extends Error {
  readonly code: RpcErrorCode | null;
  constructor(source: { message?: string; code?: string } | null | undefined) {
    super(source?.message ?? 'REQUEST_FAILED');
    this.name = 'ApiError';
    this.code = rpcErrorCode(source);
  }
}

/** i18n key (namespace `common`) for any error thrown by this module. */
export function apiErrorKey(error: unknown): string {
  return error instanceof ApiError && error.code ? `errors.${error.code}` : 'errors.GENERIC';
}

function unwrap<T>(res: {
  data: T;
  error: { message?: string; code?: string } | null;
}): NonNullable<T> {
  if (res.error) throw new ApiError(res.error);
  if (res.data === null || res.data === undefined) throw new ApiError({ message: 'NOT_FOUND' });
  return res.data;
}

// ------------------------------------------------------------------ context

export async function fetchPatientContext(userId: string): Promise<PatientContext> {
  const patient = unwrap(
    await supabase
      .from('patients')
      .select('id, full_name, is_verified, allergies, chronic_conditions, rh_negative')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle(),
  );
  const [pregnancy, settings] = await Promise.all([
    supabase
      .from('pregnancies')
      .select('id, edd_final, lmp_date, risk_level, risk_factors')
      .eq('patient_id', patient.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('hospital_settings')
      .select(
        'name, address, phone, timezone, min_lead_hours, max_advance_days, patient_cancel_cutoff_hours, unverified_max_upcoming, verified_max_upcoming',
      )
      .eq('id', 1)
      .single(),
  ]);
  if (pregnancy.error) throw new ApiError(pregnancy.error);
  return { patient, pregnancy: pregnancy.data, settings: unwrap(settings) };
}

// ------------------------------------------------------------------ doctors

export async function fetchDoctorDirectory(): Promise<DoctorEntry[]> {
  const rows = unwrap(
    await supabase
      .from('doctor_directory')
      .select('id, full_name, designation, specialization, bio, avatar_path, accepts_new_patients'),
  );
  return rows.flatMap((r) =>
    r.id && r.full_name
      ? [
          {
            ...r,
            id: r.id,
            full_name: r.full_name,
            accepts_new_patients: r.accepts_new_patients ?? false,
          },
        ]
      : [],
  );
}

export type CareTeamRow = Omit<CareTeamMember, 'doctor'>;

export async function fetchCareTeam(pregnancyId: string): Promise<CareTeamRow[]> {
  return unwrap(
    await supabase
      .from('care_team')
      .select('id, doctor_id, care_role, note')
      .eq('pregnancy_id', pregnancyId)
      .is('removed_at', null),
  );
}

// ------------------------------------------------------------------ appointments

const APPOINTMENT_COLUMNS =
  'id, doctor_id, visit_id, starts_at, ends_at, status, reason, notes_for_patient, cancelled_reason, rescheduled_from, checked_in_at';

export async function fetchAppointments(patientId: string): Promise<Appointment[]> {
  return unwrap(
    await supabase
      .from('appointments')
      .select(APPOINTMENT_COLUMNS)
      .eq('patient_id', patientId)
      .order('starts_at', { ascending: false })
      .limit(200),
  );
}

export async function fetchAppointment(id: string): Promise<Appointment> {
  return unwrap(
    await supabase.from('appointments').select(APPOINTMENT_COLUMNS).eq('id', id).maybeSingle(),
  );
}

export async function fetchSlots(doctorId: string, from: string, to: string): Promise<Slot[]> {
  const res = await supabase.rpc('available_slots', { p_doctor: doctorId, p_from: from, p_to: to });
  return unwrap(res).map((s) => ({ starts_at: s.starts_at, ends_at: s.ends_at }));
}

export interface BookArgs {
  doctorId: string;
  startsAt: string;
  visitId?: string | null;
  reason?: string | null;
}

export async function bookAppointment(args: BookArgs): Promise<string> {
  const res = await supabase.rpc('book_appointment', {
    p_doctor: args.doctorId,
    p_starts_at: args.startsAt,
    p_visit: args.visitId ?? undefined,
    p_reason: args.reason ?? undefined,
  });
  return unwrap(res);
}

export interface RescheduleArgs {
  appointmentId: string;
  startsAt: string;
  doctorId?: string | null;
}

export async function rescheduleAppointment(args: RescheduleArgs): Promise<string> {
  const res = await supabase.rpc('reschedule_appointment', {
    p_appt: args.appointmentId,
    p_new_starts_at: args.startsAt,
    p_doctor: args.doctorId ?? undefined,
  });
  return unwrap(res);
}

export async function cancelAppointment(appointmentId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_appointment', {
    p_appt: appointmentId,
    p_reason: reason,
  });
  if (error) throw new ApiError(error);
}

// ------------------------------------------------------------------ journey

export async function fetchVisits(pregnancyId: string): Promise<Visit[]> {
  return unwrap(
    await supabase
      .from('visits')
      .select(
        'id, seq, target_week, due_from, due_to, title, purpose, recommended_tests, status, appointment_id, is_extra, reason_added',
      )
      .eq('pregnancy_id', pregnancyId)
      .order('seq', { ascending: true }),
  );
}

export async function fetchMilestones(): Promise<Milestone[]> {
  return unwrap(
    await supabase
      .from('milestones')
      .select('key, title, week_from, week_to, description, category')
      .order('week_from', { ascending: true }),
  );
}

export async function fetchWeekContent(): Promise<WeekContent[]> {
  return unwrap(await supabase.from('week_content').select('*').order('week', { ascending: true }));
}

// ------------------------------------------------------------------ summaries, prescriptions

export async function fetchPublishedSummaries(pregnancyId: string): Promise<PublishedSummary[]> {
  const rows = unwrap(
    await supabase
      .from('published_summaries')
      .select('id, pregnancy_id, source_type, source_id, final, reviewed_by, published_at')
      .eq('pregnancy_id', pregnancyId)
      .order('published_at', { ascending: false }),
  );
  return rows.flatMap((r) =>
    r.id && r.pregnancy_id && r.source_type && r.published_at
      ? [
          {
            ...r,
            id: r.id,
            pregnancy_id: r.pregnancy_id,
            source_type: r.source_type,
            published_at: r.published_at,
          },
        ]
      : [],
  );
}

export async function fetchPublishedSummary(id: string): Promise<PublishedSummary> {
  const row = unwrap(
    await supabase
      .from('published_summaries')
      .select('id, pregnancy_id, source_type, source_id, final, reviewed_by, published_at')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!row.id || !row.pregnancy_id || !row.source_type || !row.published_at) {
    throw new ApiError({ message: 'NOT_FOUND' });
  }
  return {
    ...row,
    id: row.id,
    pregnancy_id: row.pregnancy_id,
    source_type: row.source_type,
    published_at: row.published_at,
  };
}

export async function fetchConsultations(pregnancyId: string): Promise<Consultation[]> {
  return unwrap(
    await supabase
      .from('consultations')
      .select(
        'id, doctor_id, ga_weeks, ga_days, advice, diet_advice, next_visit_after_weeks, published_at, created_at, weight_kg, bp_systolic, bp_diastolic',
      )
      .eq('pregnancy_id', pregnancyId)
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false }),
  );
}

export async function fetchPrescriptionItems(pregnancyId: string): Promise<PrescriptionItem[]> {
  return unwrap(
    await supabase
      .from('prescription_items')
      .select(
        'id, consultation_id, drug_name, strength, dosage_form, dose, frequency, timing, route, duration_days, start_date, end_date, instructions, is_active, stopped_at, created_at',
      )
      .eq('pregnancy_id', pregnancyId),
  );
}

export async function fetchGuidance(): Promise<GuidanceRow[]> {
  return unwrap(
    await supabase
      .from('curated_guidance')
      .select('id, kind, trimester, condition, text, reason')
      .eq('is_active', true),
  );
}

// ------------------------------------------------------------------ reports

export async function fetchReports(pregnancyId: string): Promise<Report[]> {
  return unwrap(
    await supabase
      .from('reports')
      .select('id, type, title, report_date, lab_name, doctor_comment, verified_at, created_at')
      .eq('pregnancy_id', pregnancyId)
      .is('deleted_at', null)
      .order('report_date', { ascending: false, nullsFirst: false }),
  );
}

export async function fetchReport(id: string): Promise<Report> {
  return unwrap(
    await supabase
      .from('reports')
      .select('id, type, title, report_date, lab_name, doctor_comment, verified_at, created_at')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  );
}

export async function fetchReportFiles(reportId: string): Promise<ReportFile[]> {
  return unwrap(
    await supabase
      .from('report_files')
      .select('id, report_id, storage_path, mime_type, page_no')
      .eq('report_id', reportId)
      .order('page_no', { ascending: true }),
  );
}

const LAB_COLUMNS =
  'id, report_id, test_code, raw_name, value_num, value_text, unit, ref_low, ref_high, flag, verified, observed_on, created_at';

/** Verified values only (RLS also hides unverified ones from patients). */
export async function fetchReportLabResults(reportId: string): Promise<LabResult[]> {
  return unwrap(
    await supabase
      .from('lab_results')
      .select(LAB_COLUMNS)
      .eq('report_id', reportId)
      .eq('verified', true),
  );
}

export async function fetchPregnancyLabResults(pregnancyId: string): Promise<LabResult[]> {
  return unwrap(
    await supabase
      .from('lab_results')
      .select(LAB_COLUMNS)
      .eq('pregnancy_id', pregnancyId)
      .eq('verified', true)
      .order('observed_on', { ascending: true }),
  );
}

export async function fetchLabTests(): Promise<LabTest[]> {
  return unwrap(await supabase.from('lab_tests').select('code, name, unit'));
}

/** Short-lived link to a report file (private bucket, contracts.md §6). Never log the result. */
export async function createReportFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('reports').createSignedUrl(storagePath, 60);
  if (error || !data) throw new ApiError({ message: error?.message ?? 'FILE_UNAVAILABLE' });
  return data.signedUrl;
}
