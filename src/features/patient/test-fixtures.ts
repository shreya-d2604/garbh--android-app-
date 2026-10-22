// Row factories for Jest. Not imported by app code.
import type {
  Appointment,
  CareTeamMember,
  Consultation,
  DoctorEntry,
  GuidanceRow,
  LabResult,
  Milestone,
  PrescriptionItem,
  Report,
  Visit,
  WeekContent,
} from './types';

export const doctor = (over: Partial<DoctorEntry> = {}): DoctorEntry => ({
  id: 'doc-asha',
  full_name: 'Dr. Asha Rao',
  designation: 'Senior Consultant',
  specialization: 'Obstetrics & Gynaecology',
  bio: null,
  avatar_path: null,
  accepts_new_patients: true,
  ...over,
});

export const member = (over: Partial<CareTeamMember> = {}): CareTeamMember => ({
  id: 'ct-1',
  doctor_id: 'doc-asha',
  care_role: 'primary',
  note: null,
  doctor: doctor(),
  ...over,
});

export const visit = (over: Partial<Visit> = {}): Visit => ({
  id: 'v1',
  seq: 1,
  target_week: 8,
  due_from: '2026-01-01',
  due_to: '2026-01-14',
  title: 'Visit 1',
  purpose: 'Booking visit',
  recommended_tests: [],
  status: 'planned',
  appointment_id: null,
  is_extra: false,
  reason_added: null,
  ...over,
});

export const milestone = (over: Partial<Milestone> = {}): Milestone => ({
  key: 'ogtt',
  title: 'Sugar test (OGTT 75g)',
  week_from: 24,
  week_to: 28,
  description: 'Checks for diabetes in pregnancy.',
  category: 'test',
  ...over,
});

export const weekContent = (over: Partial<WeekContent> = {}): WeekContent => ({
  week: 20,
  baby_size_label: 'Banana',
  baby_length_cm: 25.6,
  baby_weight_g: 300,
  baby_development: 'Halfway there!',
  mother_changes: null,
  tips: null,
  image_path: null,
  ...over,
});

export const appointment = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  doctor_id: 'doc-asha',
  visit_id: null,
  starts_at: '2026-10-25T05:30:00.000Z',
  ends_at: '2026-10-25T05:45:00.000Z',
  status: 'booked',
  reason: null,
  notes_for_patient: null,
  cancelled_reason: null,
  rescheduled_from: null,
  checked_in_at: null,
  ...over,
});

export const guidance = (over: Partial<GuidanceRow> = {}): GuidanceRow => ({
  id: 'g1',
  kind: 'food_recommend',
  trimester: null,
  condition: null,
  text: 'Green leafy vegetables, dal, eggs or paneer daily',
  reason: 'Protein, iron and folate',
  ...over,
});

export const consultation = (over: Partial<Consultation> = {}): Consultation => ({
  id: 'c1',
  doctor_id: 'doc-asha',
  ga_weeks: 20,
  ga_days: 3,
  advice: 'Continue iron and calcium tablets.',
  diet_advice: null,
  next_visit_after_weeks: 4,
  published_at: '2026-09-24T05:30:00.000Z',
  created_at: '2026-09-24T05:30:00.000Z',
  weight_kg: 58.4,
  bp_systolic: 110,
  bp_diastolic: 70,
  ...over,
});

export const item = (over: Partial<PrescriptionItem> = {}): PrescriptionItem => ({
  id: 'p1',
  consultation_id: 'c1',
  drug_name: 'Ferrous ascorbate',
  strength: '100 mg',
  dosage_form: 'Tablet',
  dose: '1 tablet',
  frequency: '0-1-0',
  timing: 'After food',
  route: 'Oral',
  duration_days: 90,
  start_date: '2026-09-24',
  end_date: '2026-12-22',
  instructions: null,
  is_active: true,
  stopped_at: null,
  created_at: '2026-09-24T05:30:00.000Z',
  ...over,
});

export const report = (over: Partial<Report> = {}): Report => ({
  id: 'r1',
  type: 'blood',
  title: 'CBC + TSH',
  report_date: '2026-09-23',
  lab_name: 'City Diagnostics',
  doctor_comment: null,
  verified_at: null,
  created_at: '2026-09-23T05:30:00.000Z',
  ...over,
});

export const lab = (over: Partial<LabResult> = {}): LabResult => ({
  id: 'l1',
  report_id: 'r1',
  test_code: 'HB',
  raw_name: 'Haemoglobin',
  value_num: 10.4,
  value_text: null,
  unit: 'g/dL',
  ref_low: 11,
  ref_high: 15,
  flag: 'low',
  verified: true,
  observed_on: '2026-09-23',
  created_at: '2026-09-23T05:30:00.000Z',
  ...over,
});

// ------------------------------------------------------------------ hook results for screen tests

const base = { isRefetching: false, error: null };

/** A loaded query result (cast: screens only read data / isLoading / isError / refetch). */
export const queryOf = <T>(data: T, refetch: () => unknown = jest.fn()) =>
  ({ ...base, data, isLoading: false, isError: false, refetch }) as never;

export const queryLoading = () =>
  ({ ...base, data: undefined, isLoading: true, isError: false, refetch: jest.fn() }) as never;

export const queryFailed = (refetch: () => unknown = jest.fn(), error: unknown = null) =>
  ({ ...base, error, data: undefined, isLoading: false, isError: true, refetch }) as never;

export const settings = {
  name: 'GARBH Demo Hospital',
  address: '12 MG Road, Pune',
  phone: '+91 20 4000 1234',
  timezone: 'Asia/Kolkata',
  min_lead_hours: 2,
  max_advance_days: 60,
  patient_cancel_cutoff_hours: 4,
  unverified_max_upcoming: 1,
  verified_max_upcoming: 3,
};

export const patientContext = (
  edd: string | null,
  over: { verified?: boolean; conditions?: string[]; risks?: string[] } = {},
) => ({
  patient: {
    id: 'pat-1',
    full_name: 'Kavya Iyer',
    is_verified: over.verified ?? true,
    allergies: [],
    chronic_conditions: over.conditions ?? [],
    rh_negative: false,
  },
  pregnancy: edd
    ? {
        id: 'preg-1',
        edd_final: edd,
        lmp_date: null,
        risk_level: 'low' as const,
        risk_factors: over.risks ?? [],
      }
    : null,
  settings,
});
