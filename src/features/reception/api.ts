// Reception data access (AGENTS.md §4). Every function throws the Supabase/PostgREST error on failure so
// callers can show `t(rpcErrorKey(error))`. Reception never reads clinical tables: only patients,
// pregnancies (dates), care_team, visits (plan), appointments, availability and the doctor directory.
import { addDays, type ISODate } from '@/domain/pregnancy-math';
import { supabase } from '@/lib/supabase';
import type { Database, Json } from '@/types/database';

import { localDayRange, type ApptStatus, type SlotRow, type TimeOffRow } from './calendar';
import {
  buildDuplicateOrFilter,
  buildSearchOrFilter,
  matchDuplicates,
  type DuplicateInput,
  type DuplicateMatch,
} from './duplicates';
import type { DueVisit } from './visits-due';

export type BookingChannel = Database['public']['Enums']['booking_channel'];

// ---------------------------------------------------------------- types

export interface Doctor {
  id: string;
  full_name: string;
  designation: string | null;
  accepts_new_patients: boolean;
}

export interface PatientRef {
  full_name: string;
  mrn: string | null;
  phone: string | null;
  verified_at: string | null;
}

export interface DeskAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: ApptStatus;
  booking_channel: BookingChannel;
  doctor_id: string;
  patient_id: string;
  pregnancy_id: string;
  visit_id: string | null;
  reason: string | null;
  patients: PatientRef | null;
}

export interface PatientSummary {
  id: string;
  full_name: string;
  mrn: string | null;
  phone: string | null;
  dob: string | null;
  verified_at: string | null;
  registration_source: string;
  user_id: string | null;
}

export interface QueuePatientRow {
  id: string;
  full_name: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
}

export interface PlannedVisit {
  id: string;
  seq: number;
  title: string;
  status: string;
  due_from: ISODate | null;
  due_to: ISODate | null;
  appointment_id: string | null;
}

export interface PatientContext {
  patient: PatientSummary;
  pregnancy: { id: string; lmp_date: ISODate | null; edd_final: ISODate | null } | null;
  careTeam: { doctor_id: string; care_role: 'primary' | 'backup' }[];
  visits: PlannedVisit[];
}

export interface DueVisitRow extends DueVisit {
  seq: number;
  title: string;
  contacted_at: string | null;
  contact_note: string | null;
  pregnancy_id: string;
  patient: { id: string; full_name: string; phone: string | null; mrn: string | null };
}

const APPT_SELECT =
  'id, starts_at, ends_at, status, booking_channel, doctor_id, patient_id, pregnancy_id, visit_id, reason, patients(full_name, mrn, phone, verified_at)';

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

// ---------------------------------------------------------------- reads

export async function fetchDoctors(): Promise<Doctor[]> {
  const rows = unwrap(
    await supabase
      .from('doctor_directory')
      .select('id, full_name, designation, accepts_new_patients')
      .order('full_name'),
  );
  return rows.map((r) => ({
    id: r.id ?? '',
    full_name: r.full_name ?? '',
    designation: r.designation,
    accepts_new_patients: r.accepts_new_patients ?? false,
  }));
}

export async function fetchDayAppointments(
  date: ISODate,
  doctorId?: string,
): Promise<DeskAppointment[]> {
  const { from, to } = localDayRange(date);
  let query = supabase
    .from('appointments')
    .select(APPT_SELECT)
    .gte('starts_at', from)
    .lt('starts_at', to)
    .order('starts_at');
  if (doctorId) query = query.eq('doctor_id', doctorId);
  return unwrap(await query) as unknown as DeskAppointment[];
}

export async function fetchAppointment(id: string): Promise<DeskAppointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select(APPT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as DeskAppointment | null;
}

export async function fetchFreeSlots(
  doctorId: string,
  from: ISODate,
  to: ISODate,
): Promise<SlotRow[]> {
  return unwrap(
    await supabase.rpc('available_slots', { p_doctor: doctorId, p_from: from, p_to: to }),
  );
}

export async function fetchVerifyQueue(): Promise<QueuePatientRow[]> {
  return unwrap(
    await supabase
      .from('patients')
      .select('id, full_name, dob, phone, email, address, created_at')
      .eq('registration_source', 'app')
      .is('verified_at', null)
      .is('deleted_at', null)
      .order('created_at'),
  );
}

export async function fetchQueuePatient(id: string): Promise<QueuePatientRow | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('id, full_name, dob, phone, email, address, created_at')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function searchPatients(
  term: string,
  options: { deskRecordsOnly?: boolean } = {},
): Promise<PatientSummary[]> {
  const filter = buildSearchOrFilter(term);
  if (!filter) return [];
  let query = supabase
    .from('patients')
    .select('id, full_name, mrn, phone, dob, verified_at, registration_source, user_id')
    .is('deleted_at', null)
    .or(filter)
    .order('full_name')
    .limit(20);
  if (options.deskRecordsOnly) query = query.eq('registration_source', 'desk').is('user_id', null);
  return unwrap(await query);
}

export async function fetchPatientContext(patientId: string): Promise<PatientContext | null> {
  const patient = await supabase
    .from('patients')
    .select('id, full_name, mrn, phone, dob, verified_at, registration_source, user_id')
    .eq('id', patientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (patient.error) throw patient.error;
  if (!patient.data) return null;

  const preg = await supabase
    .from('pregnancies')
    .select(
      'id, lmp_date, edd_final, care_team(doctor_id, care_role, removed_at), visits(id, seq, title, status, due_from, due_to, appointment_id)',
    )
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .maybeSingle();
  if (preg.error) throw preg.error;
  const row = preg.data as unknown as {
    id: string;
    lmp_date: string | null;
    edd_final: string | null;
    care_team: { doctor_id: string; care_role: 'primary' | 'backup'; removed_at: string | null }[];
    visits: PlannedVisit[];
  } | null;

  return {
    patient: patient.data,
    pregnancy: row ? { id: row.id, lmp_date: row.lmp_date, edd_final: row.edd_final } : null,
    careTeam: (row?.care_team ?? [])
      .filter((c) => c.removed_at === null)
      .map((c) => ({ doctor_id: c.doctor_id, care_role: c.care_role })),
    visits: [...(row?.visits ?? [])].sort((a, b) => a.seq - b.seq),
  };
}

export async function fetchDueVisits(today: ISODate, windowDays: number): Promise<DueVisitRow[]> {
  const rows = unwrap(
    await supabase
      .from('visits')
      .select(
        'id, seq, title, status, due_from, due_to, appointment_id, contacted_at, contact_note, pregnancy_id, pregnancies!inner(status, patients!inner(id, full_name, phone, mrn, deleted_at))',
      )
      .in('status', ['planned', 'missed'])
      .is('appointment_id', null)
      .lte('due_from', addDays(today, windowDays))
      .eq('pregnancies.status', 'active')
      .is('pregnancies.patients.deleted_at', null)
      .order('due_from')
      .limit(300),
  ) as unknown as (Omit<DueVisitRow, 'patient'> & {
    pregnancies: {
      patients: { id: string; full_name: string; phone: string | null; mrn: string | null };
    };
  })[];
  return rows.map(({ pregnancies, ...visit }) => ({ ...visit, patient: pregnancies.patients }));
}

/** Upcoming time off of all doctors plus the active appointments that fall inside it. */
export async function fetchTimeOffImpact(nowIso: string): Promise<{
  timeOff: TimeOffRow[];
  appointments: DeskAppointment[];
}> {
  const timeOff = unwrap(
    await supabase
      .from('doctor_time_off')
      .select('id, doctor_id, starts_at, ends_at, reason')
      .gt('ends_at', nowIso)
      .order('starts_at')
      .limit(200),
  );
  if (timeOff.length === 0) return { timeOff, appointments: [] };

  const doctors = [...new Set(timeOff.map((t) => t.doctor_id))];
  const first = timeOff.reduce(
    (m, t) => (t.starts_at < m ? t.starts_at : m),
    timeOff[0]!.starts_at,
  );
  const last = timeOff.reduce((m, t) => (t.ends_at > m ? t.ends_at : m), timeOff[0]!.ends_at);
  const appointments = unwrap(
    await supabase
      .from('appointments')
      .select(APPT_SELECT)
      .in('doctor_id', doctors)
      .in('status', ['booked', 'confirmed'])
      .lt('starts_at', last)
      .gt('ends_at', first < nowIso ? nowIso : first)
      .order('starts_at')
      .limit(500),
  ) as unknown as DeskAppointment[];
  return { timeOff, appointments };
}

/** Existing patients that look like the person being registered (phone, email, or name + date of birth). */
export async function findDuplicatePatients(input: DuplicateInput): Promise<DuplicateMatch[]> {
  const filter = buildDuplicateOrFilter(input);
  if (!filter) return [];
  const rows = unwrap(
    await supabase
      .from('patients')
      .select('id, full_name, phone, email, dob, mrn')
      .is('deleted_at', null)
      .or(filter)
      .limit(50),
  );
  return matchDuplicates(input, rows);
}

export async function suggestMrn(): Promise<string> {
  return unwrap(await supabase.rpc('next_mrn'));
}

// ---------------------------------------------------------------- writes (all through RPCs)

export async function bookAppointment(args: {
  doctor: string;
  startsAt: string;
  pregnancy: string;
  visit?: string | null;
  reason?: string | null;
}): Promise<string> {
  return unwrap(
    await supabase.rpc('book_appointment', {
      p_doctor: args.doctor,
      p_starts_at: args.startsAt,
      p_pregnancy: args.pregnancy,
      p_visit: args.visit ?? undefined,
      p_reason: args.reason?.trim() || undefined,
    }),
  );
}

export async function rescheduleAppointment(args: {
  appointment: string;
  startsAt: string;
  doctor?: string;
}): Promise<string> {
  return unwrap(
    await supabase.rpc('reschedule_appointment', {
      p_appt: args.appointment,
      p_new_starts_at: args.startsAt,
      p_doctor: args.doctor,
    }),
  );
}

export async function cancelAppointment(args: {
  appointment: string;
  reason: string;
}): Promise<void> {
  unwrap(
    await supabase.rpc('cancel_appointment', { p_appt: args.appointment, p_reason: args.reason }),
  );
}

export async function setAppointmentStatus(args: {
  appointment: string;
  status: ApptStatus;
}): Promise<void> {
  unwrap(
    await supabase.rpc('set_appointment_status', {
      p_appt: args.appointment,
      p_status: args.status,
    }),
  );
}

export async function verifyPatient(args: {
  patient: string;
  mrn: string;
  mergeInto?: string;
}): Promise<void> {
  unwrap(
    await supabase.rpc('verify_patient', {
      p_patient: args.patient,
      p_mrn: args.mrn,
      p_merge_into: args.mergeInto,
    }),
  );
}

export async function registerPatient(details: object): Promise<string> {
  // JSON.stringify drops the undefined (blank optional) fields.
  return unwrap(
    await supabase.rpc('register_patient', {
      p_details: JSON.parse(JSON.stringify(details)) as Json,
    }),
  );
}

export async function markVisitContacted(args: { visit: string; note: string }): Promise<void> {
  unwrap(await supabase.rpc('mark_visit_contacted', { p_visit: args.visit, p_note: args.note }));
}

export async function updatePatientDetails(
  id: string,
  values: { full_name: string; phone?: string; email?: string; dob?: string; address?: string },
): Promise<void> {
  const { error } = await supabase
    .from('patients')
    .update({
      full_name: values.full_name.trim(),
      phone: values.phone?.trim() || null,
      email: values.email?.trim().toLowerCase() || null,
      dob: values.dob || null,
      address: values.address?.trim() || null,
    })
    .eq('id', id);
  if (error) throw error;
}
