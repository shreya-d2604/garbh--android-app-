// TanStack Query hooks for the admin area. Query keys start with 'admin'; every mutation invalidates
// them, so lists, counts and the dashboard refresh after a change.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import {
  adminUsers,
  careTeam,
  closeAppointment,
  createOwnRequest,
  createPatient,
  createPregnancy,
  deleteConfigRow,
  exportPatientData,
  fetchAiSummary,
  fetchAppointment,
  fetchAuditPage,
  fetchCareTeam,
  fetchConfigRow,
  fetchConfigRows,
  fetchConsultation,
  fetchDashboard,
  fetchDoctors,
  fetchDqCounts,
  fetchDqIssues,
  fetchHospitalSettings,
  fetchLabResult,
  fetchOwnRequests,
  fetchPatient,
  fetchPatients,
  fetchPeople,
  fetchPregnancies,
  fetchPregnancy,
  fetchPregnancyOwner,
  fetchReportValues,
  fetchRequests,
  fetchStaff,
  fetchStaffMember,
  hardDeletePatient,
  mergePatients,
  resolveRequest,
  searchPatients,
  searchPeople,
  saveConfigRow,
  saveHospitalSettings,
  setPatientDeleted,
  updateConsultation,
  updateLabValue,
  updateOwnProfile,
  updatePatient,
  updatePregnancyDates,
  updatePregnancyStatus,
  type PatientFilter,
  type RequestFilter,
} from './api';
import { AUDIT_PAGE_SIZE, type AuditFilters } from './audit';
import type { ConfigTable } from './config';

const ADMIN: QueryKey = ['admin'];

export const adminKeys = {
  dashboard: ['admin', 'dashboard'] as const,
  dqCounts: ['admin', 'dq', 'counts'] as const,
  dqIssues: (rule: string) => ['admin', 'dq', 'issues', rule] as const,
  staff: ['admin', 'staff'] as const,
  staffMember: (id: string) => ['admin', 'staff', id] as const,
  doctors: ['admin', 'doctors'] as const,
  patients: (search: string, filter: PatientFilter) =>
    ['admin', 'patients', search, filter] as const,
  patient: (id: string) => ['admin', 'patient', id] as const,
  pregnancies: (patientId: string) => ['admin', 'pregnancies', patientId] as const,
  pregnancy: (id: string) => ['admin', 'pregnancy', id] as const,
  careTeam: (pregnancyId: string) => ['admin', 'care-team', pregnancyId] as const,
  requests: (filter: RequestFilter) => ['admin', 'requests', filter] as const,
  audit: (filters: AuditFilters) => ['admin', 'audit', filters] as const,
  config: (table: string) => ['admin', 'config', table] as const,
  configRow: (table: string, id: string) => ['admin', 'config', table, id] as const,
  hospital: ['admin', 'hospital'] as const,
  ownRequests: (userId: string) => ['admin', 'own-requests', userId] as const,
};

// ---------------------------------------------------------------- generic mutation
function useAdminMutation<V, D = void>(fn: (v: V) => Promise<D>, invalidate: QueryKey = ADMIN) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidate }),
  });
}

// ---------------------------------------------------------------- dashboard + data quality
export const useDashboard = () =>
  useQuery({ queryKey: adminKeys.dashboard, queryFn: fetchDashboard });
export const useDqCounts = () => useQuery({ queryKey: adminKeys.dqCounts, queryFn: fetchDqCounts });
export const useDqIssues = (rule: string) =>
  useQuery({ queryKey: adminKeys.dqIssues(rule), queryFn: () => fetchDqIssues(rule) });

// ---------------------------------------------------------------- staff
export const useStaff = () => useQuery({ queryKey: adminKeys.staff, queryFn: fetchStaff });
export const useStaffMember = (id: string) =>
  useQuery({ queryKey: adminKeys.staffMember(id), queryFn: () => fetchStaffMember(id) });
export const useDoctors = () => useQuery({ queryKey: adminKeys.doctors, queryFn: fetchDoctors });
export const useCreateStaff = () => useAdminMutation(adminUsers.create);
export const useUpdateStaff = () =>
  useAdminMutation((v: { id: string; fields: Record<string, unknown> }) =>
    adminUsers.update(v.id, v.fields),
  );
export const useSetStaffRole = () =>
  useAdminMutation((v: { id: string; role: Parameters<typeof adminUsers.setRole>[1] }) =>
    adminUsers.setRole(v.id, v.role),
  );
export const useSetStaffActive = () =>
  useAdminMutation((v: { id: string; active: boolean }) => adminUsers.setActive(v.id, v.active));
export const useResendInvite = () => useAdminMutation(adminUsers.resendInvite);

// ---------------------------------------------------------------- patients + pregnancies
export const usePatients = (search: string, filter: PatientFilter) =>
  useQuery({
    queryKey: adminKeys.patients(search, filter),
    queryFn: () => fetchPatients(search, filter),
  });
export const usePatient = (id: string) =>
  useQuery({ queryKey: adminKeys.patient(id), queryFn: () => fetchPatient(id) });
export const usePregnancies = (patientId: string) =>
  useQuery({
    queryKey: adminKeys.pregnancies(patientId),
    queryFn: () => fetchPregnancies(patientId),
  });
export const usePregnancy = (id: string) =>
  useQuery({ queryKey: adminKeys.pregnancy(id), queryFn: () => fetchPregnancy(id) });
export const useCareTeam = (pregnancyId: string) =>
  useQuery({
    queryKey: adminKeys.careTeam(pregnancyId),
    queryFn: () => fetchCareTeam(pregnancyId),
  });

export const useCreatePatient = () => useAdminMutation(createPatient);
export const useUpdatePatient = () =>
  useAdminMutation((v: { id: string; values: Parameters<typeof updatePatient>[1] }) =>
    updatePatient(v.id, v.values),
  );
export const useSetPatientDeleted = () =>
  useAdminMutation((v: { id: string; deleted: boolean; reason?: string }) =>
    setPatientDeleted(v.id, v.deleted, v.reason),
  );
export const useHardDeletePatient = () =>
  useAdminMutation((v: { id: string; reason: string }) => hardDeletePatient(v.id, v.reason));
export const useMergePatients = () =>
  useAdminMutation((v: { source: string; target: string }) => mergePatients(v.source, v.target));
export const useCreatePregnancy = () =>
  useAdminMutation((v: { patientId: string; lmp: string }) => createPregnancy(v.patientId, v.lmp));
export const useUpdatePregnancyDates = () =>
  useAdminMutation((v: { id: string; lmp: string | null; eddUsg: string | null; reason: string }) =>
    updatePregnancyDates(v.id, v.lmp, v.eddUsg, v.reason),
  );
export const useUpdatePregnancyStatus = () =>
  useAdminMutation((v: { id: string; values: Parameters<typeof updatePregnancyStatus>[1] }) =>
    updatePregnancyStatus(v.id, v.values),
  );
export const useSetPrimary = () =>
  useAdminMutation((v: { pregnancyId: string; doctorId: string }) =>
    careTeam.setPrimary(v.pregnancyId, v.doctorId),
  );
export const useAddBackup = () =>
  useAdminMutation((v: { pregnancyId: string; doctorId: string; note?: string }) =>
    careTeam.addBackup(v.pregnancyId, v.doctorId, v.note),
  );
export const useRemoveCareMember = () =>
  useAdminMutation((v: { pregnancyId: string; doctorId: string }) =>
    careTeam.remove(v.pregnancyId, v.doctorId),
  );

// ---------------------------------------------------------------- data-quality item fixes
export const useAppointment = (id: string) =>
  useQuery({ queryKey: ['admin', 'appointment', id], queryFn: () => fetchAppointment(id) });
export const useCloseAppointment = () =>
  useAdminMutation((v: { id: string; status: 'no_show' | 'completed' | 'cancelled' }) =>
    closeAppointment(v.id, v.status),
  );
export const useConsultation = (id: string) =>
  useQuery({ queryKey: ['admin', 'consultation', id], queryFn: () => fetchConsultation(id) });
export const useUpdateConsultation = () =>
  useAdminMutation((v: { id: string; values: Parameters<typeof updateConsultation>[1] }) =>
    updateConsultation(v.id, v.values),
  );
export const useLabResult = (id: string, enabled = true) =>
  useQuery({ queryKey: ['admin', 'lab-result', id], queryFn: () => fetchLabResult(id), enabled });
export const useUpdateLabValue = () =>
  useAdminMutation((v: { id: string; value: number | null }) => updateLabValue(v.id, v.value));
export const useReportValues = (id: string) =>
  useQuery({ queryKey: ['admin', 'report-values', id], queryFn: () => fetchReportValues(id) });
export const useAiSummary = (id: string) =>
  useQuery({ queryKey: ['admin', 'ai-summary', id], queryFn: () => fetchAiSummary(id) });
export const usePregnancyOwner = (id: string | null) =>
  useQuery({
    queryKey: ['admin', 'pregnancy-owner', id],
    queryFn: () => fetchPregnancyOwner(id ?? ''),
    enabled: !!id,
  });

// ---------------------------------------------------------------- configuration
export const useConfigRows = (def: ConfigTable) =>
  useQuery({ queryKey: adminKeys.config(def.table), queryFn: () => fetchConfigRows(def) });
export const useConfigRow = (def: ConfigTable, id: string | null) =>
  useQuery({
    queryKey: adminKeys.configRow(def.table, id ?? 'new'),
    queryFn: () => fetchConfigRow(def, id ?? ''),
    enabled: !!id,
  });
export const useSaveConfigRow = (def: ConfigTable) =>
  useAdminMutation((v: { id: string | null; payload: Parameters<typeof saveConfigRow>[2] }) =>
    saveConfigRow(def, v.id, v.payload),
  );
export const useDeleteConfigRow = (def: ConfigTable) =>
  useAdminMutation((id: string) => deleteConfigRow(def, id));
export const useHospitalSettings = () =>
  useQuery({ queryKey: adminKeys.hospital, queryFn: fetchHospitalSettings });
export const useSaveHospitalSettings = () => useAdminMutation(saveHospitalSettings);

// ---------------------------------------------------------------- audit + requests
export const useAuditLog = (filters: AuditFilters) =>
  useInfiniteQuery({
    queryKey: adminKeys.audit(filters),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const rows = await fetchAuditPage(filters, pageParam);
      const people = await fetchPeople(rows.map((r) => r.actor_id ?? ''));
      return { rows, people, page: pageParam };
    },
    getNextPageParam: (last) => (last.rows.length === AUDIT_PAGE_SIZE ? last.page + 1 : undefined),
  });
export const usePeopleSearch = (term: string) =>
  useQuery({
    queryKey: ['admin', 'search-people', term],
    queryFn: () => searchPeople(term),
    enabled: term.trim().length >= 2,
  });
export const usePatientSearch = (term: string) =>
  useQuery({
    queryKey: ['admin', 'search-patients', term],
    queryFn: () => searchPatients(term),
    enabled: term.trim().length >= 2,
  });
export const useRequests = (filter: RequestFilter) =>
  useQuery({ queryKey: adminKeys.requests(filter), queryFn: () => fetchRequests(filter) });
export const useResolveRequest = () =>
  useAdminMutation(
    (v: { id: string; status: 'in_progress' | 'done' | 'rejected'; note?: string }) =>
      resolveRequest(v.id, v.status, v.note),
  );
export const useProcessDeletion = () => useAdminMutation(adminUsers.processDeletion);
export const useExportData = () => useMutation({ mutationFn: exportPatientData });

// ---------------------------------------------------------------- own profile (every role)
export const useOwnRequests = (userId: string | undefined) =>
  useQuery({
    queryKey: adminKeys.ownRequests(userId ?? ''),
    queryFn: () => fetchOwnRequests(userId ?? ''),
    enabled: !!userId,
  });
export const useUpdateOwnProfile = () =>
  useAdminMutation(
    (v: { userId: string; full_name: string; phone: string | null }) =>
      updateOwnProfile(v.userId, { full_name: v.full_name, phone: v.phone }),
    ['admin', 'own-requests'],
  );
export const useCreateOwnRequest = () =>
  useAdminMutation(
    (v: { userId: string; kind: 'deletion' | 'export' }) => createOwnRequest(v.userId, v.kind),
    ['admin', 'own-requests'],
  );
