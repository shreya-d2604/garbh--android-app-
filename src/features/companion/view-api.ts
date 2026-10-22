// Read-only queries behind the companion screens. Every query is keyed by patient and runs under
// RLS, which already applies the permission flags; the app additionally HIDES sections whose
// permission is off, so these are only called for sections the link allows.
import { supabase } from '@/lib/supabase';

import { contentWeek } from './view';

/** Pregnancy ids of a followed patient (works without the journey permission). */
export async function fetchPregnancyIds(patientId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('companion_pregnancy_ids', { p_patient: patientId });
  if (error) throw error;
  return data;
}

export async function fetchActivePregnancy(patientId: string) {
  const { data, error } = await supabase
    .from('pregnancies')
    .select('id, edd_final, lmp_date, multiple_gestation')
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchWeekContent(weeks: number) {
  const { data, error } = await supabase
    .from('week_content')
    .select(
      'week, baby_size_label, baby_length_cm, baby_weight_g, baby_development, mother_changes, tips',
    )
    .eq('week', contentWeek(weeks))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchVisits(pregnancyId: string) {
  const { data, error } = await supabase
    .from('visits')
    .select('id, seq, title, purpose, target_week, due_from, due_to, status, recommended_tests')
    .eq('pregnancy_id', pregnancyId)
    .order('seq', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchAppointments(patientId: string) {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, starts_at, ends_at, status, reason, notes_for_patient, doctor_id')
    .eq('patient_id', patientId)
    .order('starts_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const doctorIds = [...new Set(data.map((a) => a.doctor_id))];
  const names = new Map<string, string>();
  if (doctorIds.length > 0) {
    const { data: doctors, error: dErr } = await supabase
      .from('doctor_directory')
      .select('id, full_name')
      .in('id', doctorIds);
    if (dErr) throw dErr;
    for (const d of doctors) if (d.id && d.full_name) names.set(d.id, d.full_name);
  }
  return data.map((a) => ({ ...a, doctor_name: names.get(a.doctor_id) ?? null }));
}

export async function fetchPublishedSummaries(pregnancyIds: string[]) {
  if (pregnancyIds.length === 0) return [];
  const { data, error } = await supabase
    .from('published_summaries')
    .select('id, pregnancy_id, source_type, final, published_at')
    .in('pregnancy_id', pregnancyIds)
    .order('published_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchPublishedConsultations(pregnancyIds: string[]) {
  if (pregnancyIds.length === 0) return [];
  const { data, error } = await supabase
    .from('consultations')
    .select('id, doctor_id, advice, diet_advice, next_visit_after_weeks, published_at')
    .in('pregnancy_id', pregnancyIds)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchReports(pregnancyIds: string[]) {
  if (pregnancyIds.length === 0) return [];
  const { data, error } = await supabase
    .from('reports')
    .select('id, type, title, report_date, lab_name, verified_at, doctor_comment')
    .in('pregnancy_id', pregnancyIds)
    .order('report_date', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

/** Verified values only: RLS hides the rest from companions. */
export async function fetchLabResults(reportIds: string[]) {
  if (reportIds.length === 0) return [];
  const { data, error } = await supabase
    .from('lab_results')
    .select(
      'id, report_id, test_code, raw_name, value_num, value_text, unit, ref_low, ref_high, flag, observed_on',
    )
    .in('report_id', reportIds)
    .order('observed_on', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchPrescriptionItems(pregnancyIds: string[]) {
  if (pregnancyIds.length === 0) return [];
  const { data, error } = await supabase
    .from('prescription_items')
    .select(
      'id, drug_name, strength, dosage_form, dose, frequency, timing, route, duration_days, start_date, end_date, instructions, is_active, created_at',
    )
    .in('pregnancy_id', pregnancyIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
