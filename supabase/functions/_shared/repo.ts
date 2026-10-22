// Data access for the AI functions (service role: bypasses RLS, so every read here is scoped
// by an id the caller was already authorised for). Behind an interface so handlers are tested
// with an in-memory fake.
import { createClient } from './deps.ts';
import type { ConsultationSource, ContextSource, LabHistoryRow, MedicationSource } from './context.ts';
import { KEY_LABS } from './context.ts';
import type { LabResultInsert, LabTest } from './labs.ts';
import type { AiSummaryDocument } from './schemas.ts';

export interface ReportRow {
  id: string;
  pregnancy_id: string;
  type: string;
  report_date: string | null;
  files: { storage_path: string; mime_type: string; page_no: number }[];
}

export interface ConsultationRow extends ConsultationSource {
  id: string;
  pregnancy_id: string;
}

export type SummarySourceType = 'report' | 'consultation' | 'cumulative';

export interface AiRepo {
  getReport(id: string): Promise<ReportRow | null>;
  getConsultation(id: string): Promise<ConsultationRow | null>;
  pregnancyExists(id: string): Promise<boolean>;
  contextSource(pregnancyId: string): Promise<ContextSource>;
  labCatalog(): Promise<LabTest[]>;
  downloadFile(path: string): Promise<Uint8Array>;
  /** Marks earlier unreviewed drafts of the same source as superseded (regenerate). */
  supersedeDrafts(pregnancyId: string, sourceType: SummarySourceType, sourceId: string | null): Promise<void>;
  createSummary(row: { pregnancy_id: string; source_type: SummarySourceType; source_id: string | null; model: string; prompt_version: string }): Promise<string>;
  completeSummary(id: string, draft: AiSummaryDocument, extra: { input_hash: string; token_usage: unknown }): Promise<void>;
  failSummary(id: string, error: string): Promise<void>;
  replaceExtractedLabs(reportId: string, rows: LabResultInsert[]): Promise<number>;
  setReportStatus(id: string, status: 'processing' | 'done' | 'failed', error?: string | null): Promise<void>;
}

function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  // Only the operation name is surfaced: PostgREST messages can quote row values.
  if (res.error) throw new Error(`DB_${what}`);
  return res.data;
}

/** Like must(), for single-row reads that have to exist (rows are untyped: no generated types in Deno). */
// deno-lint-ignore no-explicit-any
function mustOne(res: { data: any; error: { message: string } | null }, what: string): any {
  const data = must(res, what);
  if (data === null || data === undefined) throw new Error(`DB_${what}`);
  return data;
}

export function supabaseRepo(url: string, serviceKey: string): AiRepo {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const today = async (): Promise<string> => must(await db.rpc('hospital_today'), 'TODAY') as string;

  return {
    async getReport(id) {
      const row = must(
        await db
          .from('reports')
          .select('id, pregnancy_id, type, report_date, deleted_at, report_files(storage_path, mime_type, page_no)')
          .eq('id', id)
          .maybeSingle(),
        'REPORT',
      );
      if (!row || row.deleted_at) return null;
      return {
        id: row.id,
        pregnancy_id: row.pregnancy_id,
        type: row.type,
        report_date: row.report_date,
        files: [...(row.report_files ?? [])].sort((a: { page_no: number }, b: { page_no: number }) => a.page_no - b.page_no),
      };
    },

    async getConsultation(id) {
      const row = must(
        await db
          .from('consultations')
          .select(
            'id, pregnancy_id, ga_weeks, ga_days, weight_kg, bp_systolic, bp_diastolic, pulse, temperature, spo2, fundal_height_cm, fetal_heart_rate, presentation, fetal_movements, edema, urine_albumin, urine_sugar, complaints, findings, advice, diet_advice, next_visit_after_weeks',
          )
          .eq('id', id)
          .maybeSingle(),
        'CONSULTATION',
      );
      return (row as ConsultationRow | null) ?? null;
    },

    async pregnancyExists(id) {
      const row = must(await db.from('pregnancies').select('id').eq('id', id).maybeSingle(), 'PREGNANCY');
      return !!row;
    },

    async contextSource(pregnancyId) {
      const t = await today();
      const preg = mustOne(
        await db
          .from('pregnancies')
          .select('edd_final, gravida, para, abortus, living, multiple_gestation, risk_level, risk_factors, patient_id')
          .eq('id', pregnancyId)
          .single(),
        'PREGNANCY',
      );
      const patient = mustOne(
        await db
          .from('patients')
          .select('dob, allergies, chronic_conditions, full_name, mrn, phone, email, address')
          .eq('id', preg.patient_id)
          .single(),
        'PATIENT',
      );
      const meds = must(
        await db
          .from('prescription_items')
          .select('drug_name, strength, dose, frequency, timing, start_date, end_date, is_active')
          .eq('pregnancy_id', pregnancyId)
          .eq('is_active', true),
        'MEDS',
      ) as (MedicationSource & { start_date: string | null; end_date: string | null })[];
      const labs = must(
        await db
          .from('lab_results')
          .select('test_code, value_num, value_text, unit, observed_on')
          .eq('pregnancy_id', pregnancyId)
          .eq('verified', true)
          .in('test_code', [...KEY_LABS])
          .order('observed_on', { ascending: false })
          .limit(60),
        'LABS',
      ) as LabHistoryRow[];
      const team = must(
        await db.from('care_team').select('profiles:doctor_id(full_name)').eq('pregnancy_id', pregnancyId),
        'TEAM',
      ) as unknown as { profiles: { full_name: string | null } | null }[];
      return {
        patient,
        pregnancy: preg,
        medications: meds.filter((m) => (!m.start_date || m.start_date <= t) && (!m.end_date || m.end_date >= t)),
        labs,
        today: t,
        doctor_names: team.map((x) => x.profiles?.full_name ?? '').filter(Boolean),
      };
    },

    async labCatalog() {
      return must(
        await db.from('lab_tests').select('code, name, unit, ref_low, ref_high, trimester_ref').eq('is_active', true),
        'CATALOG',
      ) as LabTest[];
    },

    async downloadFile(path) {
      const { data, error } = await db.storage.from('reports').download(path);
      if (error || !data) throw new Error('DB_DOWNLOAD');
      return new Uint8Array(await data.arrayBuffer());
    },

    async supersedeDrafts(pregnancyId, sourceType, sourceId) {
      let q = db
        .from('ai_summaries')
        .update({ status: 'rejected', doctor_note: 'Superseded by a newer draft' })
        .eq('pregnancy_id', pregnancyId)
        .eq('source_type', sourceType)
        .eq('status', 'draft');
      q = sourceId ? q.eq('source_id', sourceId) : q.is('source_id', null);
      must(await q, 'SUPERSEDE');
    },

    async createSummary(row) {
      const created = mustOne(
        await db.from('ai_summaries').insert({ ...row, status: 'generating' }).select('id').single(),
        'SUMMARY_INSERT',
      );
      return created.id as string;
    },

    async completeSummary(id, draft, extra) {
      must(
        await db
          .from('ai_summaries')
          .update({ status: 'draft', draft, input_hash: extra.input_hash, token_usage: extra.token_usage, generated_at: new Date().toISOString(), error: null })
          .eq('id', id),
        'SUMMARY_COMPLETE',
      );
    },

    async failSummary(id, error) {
      must(await db.from('ai_summaries').update({ status: 'failed', error }).eq('id', id), 'SUMMARY_FAIL');
    },

    async replaceExtractedLabs(reportId, rows) {
      must(
        await db.from('lab_results').delete().eq('report_id', reportId).eq('source', 'ai_extracted').eq('verified', false),
        'LAB_DELETE',
      );
      if (rows.length === 0) return 0;
      must(await db.from('lab_results').insert(rows), 'LAB_INSERT');
      return rows.length;
    },

    async setReportStatus(id, status, error = null) {
      must(await db.from('reports').update({ extraction_status: status, extraction_error: error }).eq('id', id), 'REPORT_STATUS');
    },
  };
}
