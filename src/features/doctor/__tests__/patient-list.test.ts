import {
  applyPatientFilters,
  countOverdueVisits,
  DEFAULT_PATIENT_FILTERS,
  hasActiveFilters,
  type PatientListItem,
} from '../patient-list';

const TODAY = '2026-09-20'; // EDD 2027-01-10 is 24w0d on this day

const p = (over: Partial<PatientListItem>): PatientListItem => ({
  pregnancyId: 'p1',
  patientId: 'pt1',
  name: 'Kavya Iyer',
  mrn: 'GH-0003',
  verified: true,
  dob: null,
  careRole: 'primary',
  riskLevel: 'low',
  status: 'active',
  eddFinal: '2027-01-10',
  overdueVisits: 0,
  ...over,
});

const list = [
  p({ pregnancyId: '1', name: 'Priya Sharma', mrn: 'GH-0001', eddFinal: '2027-04-20' }), // 9w
  p({ pregnancyId: '2', name: 'Anjali Gupta', mrn: 'GH-0004', careRole: 'backup', riskLevel: 'high', eddFinal: '2026-11-25', overdueVisits: 2 }), // 33w
  p({ pregnancyId: '3', name: 'Kavya Iyer', mrn: 'GH-0003' }), // 24w
  p({ pregnancyId: '4', name: 'Old Case', status: 'delivered', mrn: null }),
];

const ids = (items: PatientListItem[]) => items.map((i) => i.pregnancyId);

describe('patient list filters', () => {
  it('shows active pregnancies by name by default', () => {
    expect(ids(applyPatientFilters(list, DEFAULT_PATIENT_FILTERS, TODAY))).toEqual(['2', '3', '1']);
  });

  it('searches name and MRN, case-insensitively', () => {
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, query: 'kav' }, TODAY))).toEqual(['3']);
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, query: 'gh-0004' }, TODAY))).toEqual(['2']);
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, query: '  ' }, TODAY))).toHaveLength(3);
  });

  it('filters by care role', () => {
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, role: 'backup' }, TODAY))).toEqual(['2']);
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, role: 'primary' }, TODAY))).toEqual(['3', '1']);
  });

  it('filters high risk, overdue and trimester', () => {
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, highRisk: true }, TODAY))).toEqual(['2']);
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, overdueOnly: true }, TODAY))).toEqual(['2']);
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, trimester: 1 }, TODAY))).toEqual(['1']);
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, trimester: 2 }, TODAY))).toEqual(['3']);
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, trimester: 3 }, TODAY))).toEqual(['2']);
  });

  it('shows closed pregnancies on request', () => {
    expect(ids(applyPatientFilters(list, { ...DEFAULT_PATIENT_FILTERS, closed: true }, TODAY))).toEqual(['4']);
  });

  it('combines filters', () => {
    const f = { ...DEFAULT_PATIENT_FILTERS, role: 'backup' as const, highRisk: true, trimester: 3 as const };
    expect(ids(applyPatientFilters(list, f, TODAY))).toEqual(['2']);
    expect(ids(applyPatientFilters(list, { ...f, trimester: 1 }, TODAY))).toEqual([]);
  });

  it('knows when any filter is on', () => {
    expect(hasActiveFilters(DEFAULT_PATIENT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_PATIENT_FILTERS, query: 'a' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_PATIENT_FILTERS, highRisk: true })).toBe(true);
  });

  it('counts overdue visits: planned with a window that has ended', () => {
    expect(
      countOverdueVisits(
        [
          { status: 'planned', due_to: '2026-09-01' },
          { status: 'planned', due_to: '2026-09-20' },
          { status: 'completed', due_to: '2026-08-01' },
          { status: 'planned', due_to: null },
        ],
        TODAY,
      ),
    ).toBe(1);
  });
});
