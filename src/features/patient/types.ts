// Row shapes the patient area reads. Narrow `Pick`s of the generated types so the UI only
// depends on the columns it really uses.
import type { Database } from '@/types/database';

type Tables = Database['public']['Tables'];
type Row<T extends keyof Tables> = Tables[T]['Row'];

export type ApptStatus = Database['public']['Enums']['appt_status'];
export type VisitStatus = Database['public']['Enums']['visit_status'];
export type ReportType = Database['public']['Enums']['report_type'];
export type SummarySource = Database['public']['Enums']['summary_source'];
export type CareRole = Database['public']['Enums']['care_role'];

export type PatientBasics = Pick<
  Row<'patients'>,
  'id' | 'full_name' | 'is_verified' | 'allergies' | 'chronic_conditions' | 'rh_negative'
>;

export type PregnancyBasics = Pick<
  Row<'pregnancies'>,
  'id' | 'edd_final' | 'lmp_date' | 'risk_level' | 'risk_factors'
>;

export type HospitalSettings = Pick<
  Row<'hospital_settings'>,
  | 'name'
  | 'phone'
  | 'timezone'
  | 'min_lead_hours'
  | 'max_advance_days'
  | 'patient_cancel_cutoff_hours'
  | 'unverified_max_upcoming'
  | 'verified_max_upcoming'
>;

export interface PatientContext {
  patient: PatientBasics;
  /** The active pregnancy, or null when there is none (e.g. after delivery). */
  pregnancy: PregnancyBasics | null;
  settings: HospitalSettings;
}

export interface DoctorEntry {
  id: string;
  full_name: string;
  designation: string | null;
  specialization: string | null;
  bio: string | null;
  avatar_path: string | null;
  accepts_new_patients: boolean;
}

export interface CareTeamMember {
  id: string;
  doctor_id: string;
  care_role: CareRole;
  note: string | null;
  doctor: DoctorEntry | null;
}

export type Appointment = Pick<
  Row<'appointments'>,
  | 'id'
  | 'doctor_id'
  | 'visit_id'
  | 'starts_at'
  | 'ends_at'
  | 'status'
  | 'reason'
  | 'notes_for_patient'
  | 'cancelled_reason'
  | 'rescheduled_from'
  | 'checked_in_at'
>;

export type Visit = Pick<
  Row<'visits'>,
  | 'id'
  | 'seq'
  | 'target_week'
  | 'due_from'
  | 'due_to'
  | 'title'
  | 'purpose'
  | 'recommended_tests'
  | 'status'
  | 'appointment_id'
  | 'is_extra'
  | 'reason_added'
>;

export type Milestone = Pick<
  Row<'milestones'>,
  'key' | 'title' | 'week_from' | 'week_to' | 'description' | 'category'
>;

export type WeekContent = Row<'week_content'>;

export type GuidanceRow = Pick<
  Row<'curated_guidance'>,
  'id' | 'kind' | 'trimester' | 'condition' | 'text' | 'reason'
>;

export type Consultation = Pick<
  Row<'consultations'>,
  | 'id'
  | 'doctor_id'
  | 'ga_weeks'
  | 'ga_days'
  | 'advice'
  | 'diet_advice'
  | 'next_visit_after_weeks'
  | 'published_at'
  | 'created_at'
  | 'weight_kg'
  | 'bp_systolic'
  | 'bp_diastolic'
>;

export type PrescriptionItem = Pick<
  Row<'prescription_items'>,
  | 'id'
  | 'consultation_id'
  | 'drug_name'
  | 'strength'
  | 'dosage_form'
  | 'dose'
  | 'frequency'
  | 'timing'
  | 'route'
  | 'duration_days'
  | 'start_date'
  | 'end_date'
  | 'instructions'
  | 'is_active'
  | 'stopped_at'
  | 'created_at'
>;

export type Report = Pick<
  Row<'reports'>,
  | 'id'
  | 'type'
  | 'title'
  | 'report_date'
  | 'lab_name'
  | 'doctor_comment'
  | 'verified_at'
  | 'created_at'
>;

export type ReportFile = Pick<
  Row<'report_files'>,
  'id' | 'report_id' | 'storage_path' | 'mime_type' | 'page_no'
>;

export type LabResult = Pick<
  Row<'lab_results'>,
  | 'id'
  | 'report_id'
  | 'test_code'
  | 'raw_name'
  | 'value_num'
  | 'value_text'
  | 'unit'
  | 'ref_low'
  | 'ref_high'
  | 'flag'
  | 'verified'
  | 'observed_on'
  | 'created_at'
>;

export type LabTest = Pick<Row<'lab_tests'>, 'code' | 'name' | 'unit'>;

/** A doctor-approved summary (`published_summaries` view; its columns are nullable in the types). */
export interface PublishedSummary {
  id: string;
  pregnancy_id: string;
  source_type: SummarySource;
  source_id: string | null;
  final: unknown;
  reviewed_by: string | null;
  published_at: string;
}

export interface Slot {
  starts_at: string;
  ends_at: string;
}
