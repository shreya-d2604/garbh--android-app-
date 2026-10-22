// Test fixtures shared by the Deno tests: an in-memory AiRepo, a fake caller, and a synthetic
// patient whose identifiers are easy to grep for. NEVER real PHI.
import type { Authenticate, Caller } from './auth.ts';
import type { ContextSource } from './context.ts';
import type { LabResultInsert, LabTest } from './labs.ts';
import type { AiRepo, ConsultationRow, ReportRow, SummarySourceType } from './repo.ts';
import type { AiSummaryDocument } from './schemas.ts';

export const IDS = {
  pregnancy: '20000000-0000-4000-8000-000000000003',
  report: '50000000-0000-4000-8000-000000000001',
  consultation: '40000000-0000-4000-8000-000000000001',
  user: '00000000-0000-4000-a000-000000000002',
};

export const PII = {
  name: 'Zorbia Quillfeather',
  mrn: 'MRN-778899',
  phone: '+919876500123',
  email: 'zorbia.q@example.test',
  address: '14 Lantern Row, Nowhereville',
  doctor: 'Dr. Thaddeus Wimbleton',
};

export const CATALOG: LabTest[] = [
  { code: 'HB', name: 'Haemoglobin', unit: 'g/dL', ref_low: 11, ref_high: 15, trimester_ref: null },
  { code: 'PLT', name: 'Platelet count', unit: '10^3/uL', ref_low: 150, ref_high: 400, trimester_ref: null },
  { code: 'TSH', name: 'TSH', unit: 'mIU/L', ref_low: 0.1, ref_high: 3, trimester_ref: { '1': { low: 0.1, high: 2.5 }, '2': { low: 0.2, high: 3 }, '3': { low: 0.3, high: 3 } } },
  { code: 'FBS', name: 'Fasting blood sugar', unit: 'mg/dL', ref_low: 60, ref_high: 92, trimester_ref: null },
  { code: 'OGTT_2H', name: 'OGTT 75g (2 hour)', unit: 'mg/dL', ref_low: null, ref_high: 140, trimester_ref: null },
  { code: 'URINE_PROT', name: 'Urine protein', unit: null, ref_low: null, ref_high: null, trimester_ref: null },
  { code: 'HIV', name: 'HIV 1 & 2', unit: null, ref_low: null, ref_high: null, trimester_ref: null },
];

export function contextSource(over: Partial<ContextSource> = {}): ContextSource {
  return {
    patient: {
      dob: '1994-01-05',
      allergies: ['Penicillin'],
      chronic_conditions: ['anemia'],
      full_name: PII.name,
      mrn: PII.mrn,
      phone: PII.phone,
      email: PII.email,
      address: PII.address,
    },
    pregnancy: { edd_final: '2027-01-05', gravida: 1, para: 0, abortus: 0, living: 0, multiple_gestation: 1, risk_level: 'low', risk_factors: ['Anaemia'] },
    medications: [{ drug_name: 'Ferrous ascorbate', strength: '100 mg', dose: '1 tablet', frequency: '0-1-0', timing: 'After food' }],
    labs: [],
    today: '2026-10-22',
    doctor_names: [PII.doctor],
    ...over,
  };
}

export interface FakeState {
  summaries: Map<string, { status: string; error?: string; draft?: AiSummaryDocument; source_type: SummarySourceType; source_id: string | null; model: string; prompt_version: string }>;
  labs: LabResultInsert[];
  reportStatus: { status: string; error?: string | null }[];
  superseded: number;
  downloads: string[];
}

export function fakeRepo(over: Partial<AiRepo> = {}): AiRepo & { state: FakeState } {
  const state: FakeState = { summaries: new Map(), labs: [], reportStatus: [], superseded: 0, downloads: [] };
  let n = 0;
  const report: ReportRow = {
    id: IDS.report,
    pregnancy_id: IDS.pregnancy,
    type: 'blood',
    report_date: '2026-10-20',
    files: [{ storage_path: 'p/q/r/file.pdf', mime_type: 'application/pdf', page_no: 1 }],
  };
  const consultation: ConsultationRow = {
    id: IDS.consultation,
    pregnancy_id: IDS.pregnancy,
    ga_weeks: 20, ga_days: 3, weight_kg: 58.4, bp_systolic: 110, bp_diastolic: 70, pulse: 84, temperature: null, spo2: null,
    fundal_height_cm: 20, fetal_heart_rate: 146, presentation: 'Variable', fetal_movements: null, edema: null,
    urine_albumin: null, urine_sugar: null, complaints: `Tired, says ${PII.name} herself`, findings: 'Anomaly scan normal.',
    advice: `Continue tablets. Call ${PII.phone} if worried.`, diet_advice: 'Add leafy vegetables.', next_visit_after_weeks: 4,
  };
  const repo: AiRepo & { state: FakeState } = {
    state,
    getReport: (id) => Promise.resolve(id === IDS.report ? report : null),
    getConsultation: (id) => Promise.resolve(id === IDS.consultation ? consultation : null),
    pregnancyExists: (id) => Promise.resolve(id === IDS.pregnancy),
    contextSource: () => Promise.resolve(contextSource()),
    labCatalog: () => Promise.resolve(CATALOG),
    downloadFile: (path) => {
      state.downloads.push(path);
      return Promise.resolve(new Uint8Array([1, 2, 3]));
    },
    supersedeDrafts: () => {
      state.superseded += 1;
      return Promise.resolve();
    },
    createSummary: (row) => {
      const id = `s-${++n}`;
      state.summaries.set(id, { status: 'generating', ...row });
      return Promise.resolve(id);
    },
    completeSummary: (id, draft) => {
      const s = state.summaries.get(id)!;
      state.summaries.set(id, { ...s, status: 'draft', draft });
      return Promise.resolve();
    },
    failSummary: (id, error) => {
      const s = state.summaries.get(id)!;
      state.summaries.set(id, { ...s, status: 'failed', error });
      return Promise.resolve();
    },
    replaceExtractedLabs: (_id, rows) => {
      state.labs = rows;
      return Promise.resolve(rows.length);
    },
    setReportStatus: (_id, status, error) => {
      state.reportStatus.push({ status, error });
      return Promise.resolve();
    },
    ...over,
  };
  return repo;
}

export function fakeCaller(over: Partial<Caller> & { team?: boolean; quota?: 'ok' | 'rate_limited' } = {}): Caller {
  return {
    id: IDS.user,
    onCareTeam: () => Promise.resolve(over.team ?? true),
    consumeQuota: () => Promise.resolve(over.quota ?? 'ok'),
    ...over,
  };
}

export const authAs = (caller: Caller | null): Authenticate => () => Promise.resolve(caller);

export function post(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer test' }): Request {
  return new Request('http://localhost/fn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
