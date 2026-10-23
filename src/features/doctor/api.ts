// Supabase calls for the doctor area. Every function throws the Supabase/Postgrest error
// (use rpcErrorKey() to show it); screens never see raw error text. RLS decides what is visible.
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { AiSummaryDocument } from '@/domain/schemas/ai-summary';
import type { TablesInsert, TablesUpdate } from '@/types/database';

import { parseFunctionError, type SummaryFunction } from './ai-review';
import type { DoctorOption } from './care-team';
import {
  diffConsultation,
  toConsultationColumns,
  toConsultationInsert,
  type ConsultationFormValues,
} from './consultation';
import { compressPage, readBytes } from './files';
import { labFields, type LabFormValues } from './lab-form';
import { countOverdueVisits, type PatientListItem } from './patient-list';
import { isRowBlank, pickLastPrescription, toItemInsert, validateRow } from './prescription';
import type { QueueRow } from './queue';
import { storagePath, type FileProgress, type PickedPage } from './report-upload';
import type {
  AiSummaryRow,
  AppointmentRow,
  AvailabilityRow,
  CareTeamRow,
  ConsultationRow,
  DrugRow,
  LabResultRow,
  LabTestRow,
  PatientRow,
  PregnancyRow,
  PrescriptionItemRow,
  ReportFileRow,
  ReportRow,
  ReportType,
  TimeOffRow,
  VisitRow,
} from './types';
import { textOrNull } from './format';

function unwrap<D>(res: { data: D; error: unknown }): D {
  if (res.error) throw res.error;
  return res.data;
}

function unwrapRows<T>(res: { data: T[] | null; error: unknown }): T[] {
  if (res.error) throw res.error;
  return res.data ?? [];
}

// --------------------------------------------------------------------------- Today
export async function fetchQueue(doctorId: string, from: string, to: string): Promise<QueueRow[]> {
  const res = await supabase
    .from('appointments')
    .select(
      'id, starts_at, ends_at, status, reason, booking_channel, pregnancy_id, patient_id, patients(full_name, mrn, is_verified), pregnancies(edd_final, risk_level)',
    )
    .eq('doctor_id', doctorId)
    .gte('starts_at', from)
    .lt('starts_at', to)
    .order('starts_at')
    .overrideTypes<QueueRow[], { merge: false }>();
  return unwrapRows(res);
}

/** Doctor: booked/confirmed/checked_in -> in_consultation, in_consultation -> completed (contracts §2). */
export async function setAppointmentStatus(
  appointmentId: string,
  status: 'in_consultation' | 'completed',
): Promise<void> {
  const { error } = await supabase.rpc('set_appointment_status', {
    p_appt: appointmentId,
    p_status: status,
  });
  if (error) throw error;
}

// --------------------------------------------------------------------------- Patients
interface CareTeamListRow {
  care_role: CareTeamRow['care_role'];
  pregnancy_id: string;
  pregnancies: {
    id: string;
    patient_id: string;
    edd_final: string | null;
    risk_level: PregnancyRow['risk_level'];
    status: PregnancyRow['status'];
    patients: {
      id: string;
      full_name: string;
      mrn: string | null;
      is_verified: boolean;
      dob: string | null;
    };
  };
}

export async function fetchPatientList(
  doctorId: string,
  today: string,
): Promise<PatientListItem[]> {
  const [teamRes, visitsRes] = await Promise.all([
    supabase
      .from('care_team')
      .select(
        'care_role, pregnancy_id, pregnancies!inner(id, patient_id, edd_final, risk_level, status, patients!inner(id, full_name, mrn, is_verified, dob))',
      )
      .eq('doctor_id', doctorId)
      .is('removed_at', null)
      .overrideTypes<CareTeamListRow[], { merge: false }>(),
    supabase
      .from('visits')
      .select('pregnancy_id, status, due_to')
      .eq('status', 'planned')
      .lt('due_to', today),
  ]);
  const team = unwrapRows(teamRes);
  const visits = unwrapRows(visitsRes);
  return team.map((row) => ({
    pregnancyId: row.pregnancy_id,
    patientId: row.pregnancies.patient_id,
    name: row.pregnancies.patients.full_name,
    mrn: row.pregnancies.patients.mrn,
    verified: row.pregnancies.patients.is_verified,
    dob: row.pregnancies.patients.dob,
    careRole: row.care_role,
    riskLevel: row.pregnancies.risk_level,
    status: row.pregnancies.status,
    eddFinal: row.pregnancies.edd_final,
    overdueVisits: countOverdueVisits(
      visits.filter((v) => v.pregnancy_id === row.pregnancy_id),
      today,
    ),
  }));
}

export async function fetchDoctorDirectory(): Promise<DoctorOption[]> {
  const res = await supabase
    .from('doctor_directory')
    .select('id, full_name, specialization')
    .order('full_name');
  return unwrapRows(res).flatMap((d) =>
    d.id ? [{ id: d.id, name: d.full_name ?? '', specialization: d.specialization }] : [],
  );
}

// --------------------------------------------------------------------------- Chart
export type ChartPatient = Pick<
  PatientRow,
  | 'id'
  | 'full_name'
  | 'dob'
  | 'mrn'
  | 'is_verified'
  | 'blood_group'
  | 'rh_negative'
  | 'allergies'
  | 'chronic_conditions'
>;

export interface ChartData {
  pregnancy: PregnancyRow;
  patient: ChartPatient;
  team: Pick<CareTeamRow, 'id' | 'doctor_id' | 'care_role' | 'note'>[];
}

export async function fetchChart(pregnancyId: string): Promise<ChartData | null> {
  const preg = unwrap(
    await supabase.from('pregnancies').select('*').eq('id', pregnancyId).maybeSingle(),
  );
  if (!preg) return null;
  const [patientRes, teamRes] = await Promise.all([
    supabase
      .from('patients')
      .select(
        'id, full_name, dob, mrn, is_verified, blood_group, rh_negative, allergies, chronic_conditions',
      )
      .eq('id', preg.patient_id)
      .maybeSingle(),
    supabase
      .from('care_team')
      .select('id, doctor_id, care_role, note')
      .eq('pregnancy_id', pregnancyId)
      .is('removed_at', null),
  ]);
  const patient = unwrap(patientRes);
  if (!patient) return null;
  return { pregnancy: preg, patient, team: unwrapRows(teamRes) };
}

/** Audit: opening a chart is a sensitive view (PLAN.md §0). Best effort, never blocks the screen. */
export async function logChartView(patientId: string): Promise<void> {
  await supabase.rpc('log_sensitive_view', { p_patient: patientId, p_table: 'patients' });
}

export async function fetchVisits(pregnancyId: string): Promise<VisitRow[]> {
  return unwrapRows(
    await supabase
      .from('visits')
      .select('*')
      .eq('pregnancy_id', pregnancyId)
      .order('due_from', { nullsFirst: false }),
  );
}

export async function fetchConsultations(pregnancyId: string): Promise<ConsultationRow[]> {
  return unwrapRows(
    await supabase
      .from('consultations')
      .select('*')
      .eq('pregnancy_id', pregnancyId)
      .order('created_at', { ascending: false }),
  );
}

export interface ReportWithFiles extends ReportRow {
  report_files: Pick<ReportFileRow, 'id' | 'page_no'>[];
}

export async function fetchReports(pregnancyId: string): Promise<ReportWithFiles[]> {
  const res = await supabase
    .from('reports')
    .select('*, report_files(id, page_no)')
    .eq('pregnancy_id', pregnancyId)
    .is('deleted_at', null)
    .order('report_date', { ascending: false, nullsFirst: false })
    .overrideTypes<ReportWithFiles[], { merge: false }>();
  return unwrapRows(res);
}

export async function fetchPrescriptions(pregnancyId: string): Promise<PrescriptionItemRow[]> {
  return unwrapRows(
    await supabase
      .from('prescription_items')
      .select('*')
      .eq('pregnancy_id', pregnancyId)
      .order('created_at', { ascending: false }),
  );
}

export async function fetchLabResults(pregnancyId: string): Promise<LabResultRow[]> {
  return unwrapRows(await supabase.from('lab_results').select('*').eq('pregnancy_id', pregnancyId));
}

export async function fetchPregnancySummaries(pregnancyId: string): Promise<AiSummaryRow[]> {
  return unwrapRows(
    await supabase
      .from('ai_summaries')
      .select('*')
      .eq('pregnancy_id', pregnancyId)
      .order('created_at', { ascending: false }),
  );
}

// --------------------------------------------------------------------------- Care team RPCs
export async function addBackupDoctor(
  pregnancyId: string,
  doctorId: string,
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc('add_backup_doctor', {
    p_pregnancy: pregnancyId,
    p_doctor: doctorId,
    p_note: textOrNull(note) ?? undefined,
  });
  if (error) throw error;
}

export async function removeCareTeamMember(pregnancyId: string, doctorId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_care_team_member', {
    p_pregnancy: pregnancyId,
    p_doctor: doctorId,
  });
  if (error) throw error;
}

export async function handOverPrimary(pregnancyId: string, newPrimary: string): Promise<void> {
  const { error } = await supabase.rpc('hand_over_primary', {
    p_pregnancy: pregnancyId,
    p_new_primary: newPrimary,
  });
  if (error) throw error;
}

// --------------------------------------------------------------------------- Pregnancy management
export async function updatePregnancy(
  pregnancyId: string,
  patch: TablesUpdate<'pregnancies'>,
): Promise<void> {
  const res = await supabase.from('pregnancies').update(patch).eq('id', pregnancyId).select('id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}

export async function updatePatientMedical(
  patientId: string,
  patch: Pick<
    TablesUpdate<'patients'>,
    'blood_group' | 'rh_negative' | 'allergies' | 'chronic_conditions'
  >,
): Promise<void> {
  const res = await supabase.from('patients').update(patch).eq('id', patientId).select('id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}

// --------------------------------------------------------------------------- Visit plan
export async function addExtraVisit(visit: TablesInsert<'visits'>): Promise<void> {
  const { error } = await supabase.from('visits').insert(visit);
  if (error) throw error;
}

export async function updateVisit(visitId: string, patch: TablesUpdate<'visits'>): Promise<void> {
  const res = await supabase.from('visits').update(patch).eq('id', visitId).select('id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}

export async function deleteVisit(visitId: string): Promise<void> {
  const res = await supabase.from('visits').delete().eq('id', visitId).select('id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}

export async function applyVisitTemplate(
  pregnancyId: string,
  schedule: 'standard' | 'high_risk',
): Promise<void> {
  const { error } = await supabase.rpc('apply_visit_template', {
    p_pregnancy: pregnancyId,
    p_schedule: schedule,
  });
  if (error) throw error;
}

// --------------------------------------------------------------------------- Consultation
export interface ConsultationAppointment extends Pick<
  AppointmentRow,
  | 'id'
  | 'starts_at'
  | 'status'
  | 'reason'
  | 'pregnancy_id'
  | 'patient_id'
  | 'doctor_id'
  | 'visit_id'
> {
  patients: Pick<
    PatientRow,
    'full_name' | 'mrn' | 'is_verified' | 'allergies' | 'blood_group' | 'rh_negative' | 'dob'
  > | null;
  pregnancies: Pick<PregnancyRow, 'edd_final' | 'risk_level' | 'status'> | null;
}

export interface ConsultationBundle {
  appointment: ConsultationAppointment;
  consultation: ConsultationRow | null;
  privateNote: string | null;
  items: PrescriptionItemRow[];
}

export async function fetchConsultationBundle(
  appointmentId: string,
): Promise<ConsultationBundle | null> {
  const appt = unwrap(
    await supabase
      .from('appointments')
      .select(
        'id, starts_at, status, reason, pregnancy_id, patient_id, doctor_id, visit_id, patients(full_name, mrn, is_verified, allergies, blood_group, rh_negative, dob), pregnancies(edd_final, risk_level, status)',
      )
      .eq('id', appointmentId)
      .maybeSingle()
      .overrideTypes<ConsultationAppointment, { merge: false }>(),
  );
  if (!appt) return null;
  const consultation = unwrap(
    await supabase
      .from('consultations')
      .select('*')
      .eq('appointment_id', appointmentId)
      .maybeSingle(),
  );
  if (!consultation) return { appointment: appt, consultation: null, privateNote: null, items: [] };
  const [noteRes, itemsRes] = await Promise.all([
    supabase
      .from('consultation_private_notes')
      .select('note')
      .eq('consultation_id', consultation.id)
      .maybeSingle(),
    supabase
      .from('prescription_items')
      .select('*')
      .eq('consultation_id', consultation.id)
      .order('created_at'),
  ]);
  return {
    appointment: appt,
    consultation,
    privateNote: unwrap(noteRes)?.note ?? null,
    items: unwrapRows(itemsRes),
  };
}

export async function fetchDrugCatalog(): Promise<DrugRow[]> {
  return unwrapRows(
    await supabase.from('drug_catalog').select('*').eq('is_active', true).order('name'),
  );
}

/** Prescription of the most recent earlier consultation of this pregnancy ("copy from last visit"). */
export async function fetchLastPrescription(
  pregnancyId: string,
  excludeConsultationId: string | null,
): Promise<PrescriptionItemRow[]> {
  const [items, consultations] = await Promise.all([
    fetchPrescriptions(pregnancyId),
    fetchConsultations(pregnancyId),
  ]);
  return pickLastPrescription(items, consultations, excludeConsultationId);
}

export interface SaveConsultationArgs {
  consultationId: string | null;
  appointmentId: string;
  pregnancyId: string;
  doctorId: string;
  ga: { weeks: number; days: number } | null;
  values: ConsultationFormValues;
  /** The values written by the previous save; only differences are written again. */
  previous?: ConsultationFormValues | null;
  newId: () => string;
}

/** Creates or updates the consultation, its private note and its prescription rows. Returns the id. */
export async function saveConsultation(args: SaveConsultationArgs): Promise<string> {
  const { values } = args;
  const id = args.consultationId ?? args.newId();
  const changes = diffConsultation(
    args.consultationId === null ? null : (args.previous ?? null),
    values,
  );

  if (args.consultationId === null) {
    const { error } = await supabase.from('consultations').insert(
      toConsultationInsert(values, {
        id,
        pregnancyId: args.pregnancyId,
        doctorId: args.doctorId,
        appointmentId: args.appointmentId,
        ga: args.ga,
      }),
    );
    if (error) throw error;
  } else if (changes.columns) {
    const res = await supabase
      .from('consultations')
      .update(toConsultationColumns(values))
      .eq('id', id)
      .select('id');
    if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
  }

  if (changes.note) {
    const note = textOrNull(values.private_note);
    if (note) {
      const { error } = await supabase
        .from('consultation_private_notes')
        .upsert(
          { consultation_id: id, pregnancy_id: args.pregnancyId, note },
          { onConflict: 'consultation_id' },
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('consultation_private_notes')
        .delete()
        .eq('consultation_id', id);
      if (error) throw error;
    }
  }

  // Rows with problems (e.g. no drug name yet) are left as they are in the database until fixed.
  const valid = changes.rows.filter(
    (r) => !isRowBlank(r) && Object.keys(validateRow(r)).length === 0,
  );
  if (valid.length > 0) {
    const { error } = await supabase.from('prescription_items').upsert(
      valid.map((r) => toItemInsert(r, id, args.pregnancyId)),
      { onConflict: 'id' },
    );
    if (error) throw error;
  }
  if (changes.removedIds.length > 0) {
    const { error } = await supabase
      .from('prescription_items')
      .delete()
      .eq('consultation_id', id)
      .in('id', changes.removedIds);
    if (error) throw error;
  }
  return id;
}

export async function publishConsultation(consultationId: string): Promise<void> {
  const res = await supabase
    .from('consultations')
    .update({ published_at: new Date().toISOString() })
    .eq('id', consultationId)
    .select('id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}

// --------------------------------------------------------------------------- Reports
export type ReportDetail = {
  report: ReportRow;
  files: ReportFileRow[];
  results: LabResultRow[];
  tests: LabTestRow[];
  summaryId: string | null;
};

export async function fetchReportDetail(reportId: string): Promise<ReportDetail | null> {
  const report = unwrap(
    await supabase.from('reports').select('*').eq('id', reportId).maybeSingle(),
  );
  if (!report) return null;
  const [files, results, tests, summaries] = await Promise.all([
    supabase.from('report_files').select('*').eq('report_id', reportId).order('page_no'),
    supabase.from('lab_results').select('*').eq('report_id', reportId).order('created_at'),
    supabase.from('lab_tests').select('*').eq('is_active', true).order('name'),
    supabase
      .from('ai_summaries')
      .select('id')
      .eq('source_type', 'report')
      .eq('source_id', reportId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  return {
    report,
    files: unwrapRows(files),
    results: unwrapRows(results),
    tests: unwrapRows(tests),
    summaryId: unwrapRows(summaries)[0]?.id ?? null,
  };
}

export async function createSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('reports').createSignedUrl(path, 60);
  if (error || !data) throw error ?? { message: 'NOT_FOUND' };
  return data.signedUrl;
}

export interface UploadReportArgs {
  patientId: string;
  pregnancyId: string;
  uploadedBy: string;
  type: ReportType;
  title: string;
  reportDate: string | null;
  labName: string;
  pages: PickedPage[];
  newId: () => string;
  onProgress: (files: FileProgress[]) => void;
}

/**
 * Compresses photos, uploads every page to the private `reports` bucket, then inserts the report
 * and its files. Progress is reported per finished page (supabase-js has no byte-level progress).
 * If anything fails, the uploaded objects are removed again (best effort).
 */
export async function uploadReport(args: UploadReportArgs): Promise<string> {
  const reportId = args.newId();
  // One page at a time keeps memory low on small phones; progress counts finished pages.
  const progress: FileProgress[] = args.pages.map(() => ({ size: 1, sent: 0 }));
  args.onProgress([...progress]);

  const uploaded: { id: string; path: string; mime: string; bytes: number }[] = [];
  try {
    for (const [i, original] of args.pages.entries()) {
      const page = await compressPage(original);
      const bytes = await readBytes(page.uri);
      const id = args.newId();
      const path = storagePath({
        patientId: args.patientId,
        pregnancyId: args.pregnancyId,
        reportId,
        fileId: id,
        mime: page.mime,
      });
      const { error } = await supabase.storage
        .from('reports')
        .upload(path, bytes, { contentType: page.mime });
      if (error) throw error;
      uploaded.push({ id, path, mime: page.mime, bytes: bytes.byteLength });
      progress[i] = { size: 1, sent: 1 };
      args.onProgress([...progress]);
    }
    const { error: repError } = await supabase.from('reports').insert({
      id: reportId,
      pregnancy_id: args.pregnancyId,
      type: args.type,
      title: textOrNull(args.title),
      report_date: args.reportDate,
      lab_name: textOrNull(args.labName),
      uploaded_by: args.uploadedBy,
    });
    if (repError) throw repError;
    const { error: fileError } = await supabase.from('report_files').insert(
      uploaded.map((f, i) => ({
        id: f.id,
        report_id: reportId,
        storage_path: f.path,
        mime_type: f.mime,
        page_no: i + 1,
        size_bytes: f.bytes,
      })),
    );
    if (fileError) throw fileError;
  } catch (e) {
    if (uploaded.length > 0)
      await supabase.storage.from('reports').remove(uploaded.map((f) => f.path));
    await supabase
      .from('reports')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', reportId);
    throw e;
  }
  return reportId;
}

export async function softDeleteReport(reportId: string): Promise<void> {
  const res = await supabase
    .from('reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', reportId)
    .select('id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}

export async function updateReportComment(reportId: string, comment: string): Promise<void> {
  const res = await supabase
    .from('reports')
    .update({ doctor_comment: textOrNull(comment) })
    .eq('id', reportId)
    .select('id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}

export async function addManualLabResult(input: {
  reportId: string | null;
  pregnancyId: string;
  values: LabFormValues;
  test: Pick<LabTestRow, 'unit' | 'ref_low' | 'ref_high'> | undefined;
  observedOn: string | null;
  verify: boolean;
}): Promise<void> {
  const { error } = await supabase.from('lab_results').insert({
    ...labFields(input.values, input.test),
    report_id: input.reportId,
    pregnancy_id: input.pregnancyId,
    source: 'manual',
    observed_on: input.observedOn,
    verified: input.verify,
  });
  if (error) throw error;
}

export async function updateLabResult(
  id: string,
  patch: TablesUpdate<'lab_results'>,
): Promise<void> {
  const res = await supabase.from('lab_results').update(patch).eq('id', id).select('id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}

export async function deleteLabResult(id: string): Promise<void> {
  const res = await supabase.from('lab_results').delete().eq('id', id).select('id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}

// --------------------------------------------------------------------------- AI inbox
export interface InboxRow extends Pick<
  AiSummaryRow,
  | 'id'
  | 'pregnancy_id'
  | 'source_type'
  | 'status'
  | 'generated_at'
  | 'created_at'
  | 'reviewed_at'
  | 'error'
> {
  pregnancies: { patients: { full_name: string } | null } | null;
}

export async function fetchInbox(): Promise<InboxRow[]> {
  const res = await supabase
    .from('ai_summaries')
    .select(
      'id, pregnancy_id, source_type, status, generated_at, created_at, reviewed_at, error, pregnancies(patients(full_name))',
    )
    .in('status', ['draft', 'published', 'rejected', 'failed', 'generating'])
    .order('created_at', { ascending: false })
    .limit(100)
    .overrideTypes<InboxRow[], { merge: false }>();
  return unwrapRows(res);
}

export async function fetchDraftCount(): Promise<number> {
  const { count, error } = await supabase
    .from('ai_summaries')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft');
  if (error) throw error;
  return count ?? 0;
}

export interface SummaryDetail {
  summary: AiSummaryRow;
  patientName: string;
  report: ReportRow | null;
  files: ReportFileRow[];
  results: LabResultRow[];
  tests: LabTestRow[];
  consultation: ConsultationRow | null;
}

export async function fetchSummaryDetail(summaryId: string): Promise<SummaryDetail | null> {
  const summary = unwrap(
    await supabase.from('ai_summaries').select('*').eq('id', summaryId).maybeSingle(),
  );
  if (!summary) return null;
  const preg = unwrap(
    await supabase
      .from('pregnancies')
      .select('patients(full_name)')
      .eq('id', summary.pregnancy_id)
      .maybeSingle()
      .overrideTypes<{ patients: { full_name: string } | null }, { merge: false }>(),
  );
  const base: SummaryDetail = {
    summary,
    patientName: preg?.patients?.full_name ?? '',
    report: null,
    files: [],
    results: [],
    tests: [],
    consultation: null,
  };
  if (summary.source_type === 'report' && summary.source_id) {
    const detail = await fetchReportDetail(summary.source_id);
    if (detail)
      return {
        ...base,
        report: detail.report,
        files: detail.files,
        results: detail.results,
        tests: detail.tests,
      };
  }
  if (summary.source_type === 'consultation' && summary.source_id) {
    const c = unwrap(
      await supabase.from('consultations').select('*').eq('id', summary.source_id).maybeSingle(),
    );
    return { ...base, consultation: c };
  }
  return base;
}

export async function reviewAiSummary(
  summaryId: string,
  action: 'save_draft' | 'approve_publish' | 'reject',
  final: AiSummaryDocument | null,
  note: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('review_ai_summary', {
    p_summary: summaryId,
    p_action: action,
    p_final: (final ?? undefined) as never,
    p_note: note ?? undefined,
  });
  if (error) throw error;
}

export type FunctionOutcome = { ok: true; data: unknown } | { ok: false; code: string };

/** Invokes an AI Edge Function with the user's JWT; never throws, returns an error code instead. */
export async function invokeSummaryFunction(
  name: SummaryFunction,
  body: Record<string, string>,
): Promise<FunctionOutcome> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { ok: true, data };
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { ok: false, code: parseFunctionError(res.status, parsed) };
  }
  return { ok: false, code: 'GENERIC' };
}

// --------------------------------------------------------------------------- Schedule
export async function fetchAvailability(doctorId: string): Promise<AvailabilityRow[]> {
  return unwrapRows(
    await supabase
      .from('doctor_availability')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('weekday')
      .order('start_time'),
  );
}

export async function saveAvailability(
  doctorId: string,
  row: { id: string | null; weekday: number; start: string; end: string; slot: number },
): Promise<void> {
  const payload = {
    doctor_id: doctorId,
    weekday: row.weekday,
    start_time: row.start,
    end_time: row.end,
    slot_minutes: row.slot,
  };
  const res = row.id
    ? await supabase.from('doctor_availability').update(payload).eq('id', row.id)
    : await supabase.from('doctor_availability').insert(payload);
  if (res.error) throw res.error;
}

export async function deleteAvailability(id: string): Promise<void> {
  const { error } = await supabase.from('doctor_availability').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchTimeOff(doctorId: string, fromIso: string): Promise<TimeOffRow[]> {
  return unwrapRows(
    await supabase
      .from('doctor_time_off')
      .select('*')
      .eq('doctor_id', doctorId)
      .gte('ends_at', fromIso)
      .order('starts_at'),
  );
}

export async function addTimeOff(
  doctorId: string,
  startsAt: string,
  endsAt: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.from('doctor_time_off').insert({
    doctor_id: doctorId,
    starts_at: startsAt,
    ends_at: endsAt,
    reason: textOrNull(reason),
  });
  if (error) throw error;
}

export async function deleteTimeOff(id: string): Promise<void> {
  const { error } = await supabase.from('doctor_time_off').delete().eq('id', id);
  if (error) throw error;
}

export interface ClashAppointment extends Pick<
  AppointmentRow,
  'id' | 'starts_at' | 'ends_at' | 'status' | 'pregnancy_id'
> {
  patients: { full_name: string } | null;
}

/** My active appointments overlapping [fromIso, toIso). */
export async function fetchAppointmentsBetween(
  doctorId: string,
  fromIso: string,
  toIso: string,
): Promise<ClashAppointment[]> {
  const res = await supabase
    .from('appointments')
    .select('id, starts_at, ends_at, status, pregnancy_id, patients(full_name)')
    .eq('doctor_id', doctorId)
    .in('status', ['booked', 'confirmed', 'checked_in'])
    .lt('starts_at', toIso)
    .gt('ends_at', fromIso)
    .order('starts_at')
    .overrideTypes<ClashAppointment[], { merge: false }>();
  return unwrapRows(res);
}

export async function fetchAcceptingNewPatients(doctorId: string): Promise<boolean> {
  const row = unwrap(
    await supabase
      .from('staff_details')
      .select('accepts_new_patients')
      .eq('profile_id', doctorId)
      .maybeSingle(),
  );
  return row?.accepts_new_patients ?? false;
}

export async function setAcceptingNewPatients(doctorId: string, value: boolean): Promise<void> {
  const res = await supabase
    .from('staff_details')
    .update({ accepts_new_patients: value })
    .eq('profile_id', doctorId)
    .select('profile_id');
  if (unwrapRows(res).length === 0) throw { message: 'NOT_ALLOWED' };
}
