// Row and enum aliases for the doctor area, taken from the generated database types.
import type { Enums, Tables } from '@/types/database';

export type AppointmentRow = Tables<'appointments'>;
export type PatientRow = Tables<'patients'>;
export type PregnancyRow = Tables<'pregnancies'>;
export type VisitRow = Tables<'visits'>;
export type ConsultationRow = Tables<'consultations'>;
export type PrescriptionItemRow = Tables<'prescription_items'>;
export type ReportRow = Tables<'reports'>;
export type ReportFileRow = Tables<'report_files'>;
export type LabResultRow = Tables<'lab_results'>;
export type LabTestRow = Tables<'lab_tests'>;
export type AiSummaryRow = Tables<'ai_summaries'>;
export type CareTeamRow = Tables<'care_team'>;
export type DrugRow = Tables<'drug_catalog'>;
export type AvailabilityRow = Tables<'doctor_availability'>;
export type TimeOffRow = Tables<'doctor_time_off'>;

export type ApptStatus = Enums<'appt_status'>;
export type BookingChannel = Enums<'booking_channel'>;
export type CareRole = Enums<'care_role'>;
export type RiskLevel = Enums<'risk_level'>;
export type PregnancyStatus = Enums<'pregnancy_status'>;
export type VisitStatus = Enums<'visit_status'>;
export type ReportType = Enums<'report_type'>;
export type SummarySource = Enums<'summary_source'>;
export type SummaryStatus = Enums<'summary_status'>;
