// React Query hooks for the doctor area. Query keys start with ['doctor', ...] (AGENTS.md §4).
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useRealtimeInvalidate } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { todayISO } from '@/domain/pregnancy-math';

import * as api from './api';
import { toTeamMembers, type CareTeamMember } from './care-team';
import { isNotImplemented } from './errors';
import { dayRange, toQueueItem, type QueueItem } from './queue';
import { publishFlow } from './publish-flow';

export function useMyId(): string | null {
  return useSession((s) => s.session?.user.id ?? null);
}

const key = {
  queue: (day: string) => ['doctor', 'queue', day] as const,
  patients: ['doctor', 'patients'] as const,
  directory: ['doctor', 'directory'] as const,
  pregnancy: (id: string) => ['doctor', 'pregnancy', id] as const,
  consult: (apptId: string) => ['doctor', 'consult', apptId] as const,
  drugs: ['doctor', 'drugs'] as const,
  report: (id: string) => ['doctor', 'report', id] as const,
  inbox: ['doctor', 'inbox'] as const,
  draftCount: ['doctor', 'inbox', 'count'] as const,
  summary: (id: string) => ['doctor', 'summary', id] as const,
  schedule: ['doctor', 'schedule'] as const,
};

function invalidatePregnancy(qc: QueryClient, pregnancyId: string) {
  void qc.invalidateQueries({ queryKey: key.pregnancy(pregnancyId) });
  void qc.invalidateQueries({ queryKey: key.patients });
}

// --------------------------------------------------------------------------- Today
export function useTodayQueue() {
  const me = useMyId();
  const day = todayISO();
  useRealtimeInvalidate({
    table: 'appointments',
    filter: me ? `doctor_id=eq.${me}` : undefined,
    queryKey: ['doctor', 'queue'],
    enabled: me !== null,
  });
  return useQuery({
    queryKey: key.queue(day),
    enabled: me !== null,
    queryFn: async (): Promise<QueueItem[]> => {
      const { from, to } = dayRange(new Date());
      return (await api.fetchQueue(me as string, from, to)).map(toQueueItem);
    },
  });
}

/** Moves a booked/checked-in appointment to "in consultation". A not-yet-merged RPC does not block the doctor. */
export function useStartConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (appointmentId: string) => {
      try {
        await api.setAppointmentStatus(appointmentId, 'in_consultation');
        return { statusUpdated: true };
      } catch (e) {
        if (isNotImplemented(e as { message?: string })) return { statusUpdated: false };
        throw e;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['doctor', 'queue'] });
      void qc.invalidateQueries({ queryKey: ['doctor', 'consult'] });
    },
  });
}

// --------------------------------------------------------------------------- Patients
export function usePatientList() {
  const me = useMyId();
  return useQuery({
    queryKey: key.patients,
    enabled: me !== null,
    queryFn: () => api.fetchPatientList(me as string, todayISO()),
  });
}

export function useDoctorDirectory() {
  return useQuery({ queryKey: key.directory, queryFn: api.fetchDoctorDirectory, staleTime: 5 * 60_000 });
}

// --------------------------------------------------------------------------- Chart
export function useChart(pregnancyId: string) {
  const me = useMyId();
  const patientId = useQuery({
    queryKey: [...key.pregnancy(pregnancyId), 'chart'],
    queryFn: () => api.fetchChart(pregnancyId),
  });
  const chartPatientId = patientId.data?.patient.id;
  // Every chart open is audit-logged once (PLAN.md §0).
  useEffect(() => {
    if (chartPatientId && me) void api.logChartView(chartPatientId).catch(() => undefined);
  }, [chartPatientId, me]);
  return patientId;
}

export function useCareTeam(pregnancyId: string, fallbackName: string): CareTeamMember[] | null {
  const chart = useChart(pregnancyId);
  const directory = useDoctorDirectory();
  return useMemo(
    () => (chart.data ? toTeamMembers(chart.data.team, directory.data ?? [], fallbackName) : null),
    [chart.data, directory.data, fallbackName],
  );
}

export const usePregnancyVisits = (id: string) =>
  useQuery({ queryKey: [...key.pregnancy(id), 'visits'], queryFn: () => api.fetchVisits(id) });
export const usePregnancyConsultations = (id: string) =>
  useQuery({ queryKey: [...key.pregnancy(id), 'consultations'], queryFn: () => api.fetchConsultations(id) });
export const usePregnancyReports = (id: string) =>
  useQuery({ queryKey: [...key.pregnancy(id), 'reports'], queryFn: () => api.fetchReports(id) });
export const usePregnancyPrescriptions = (id: string) =>
  useQuery({ queryKey: [...key.pregnancy(id), 'prescriptions'], queryFn: () => api.fetchPrescriptions(id) });
export const usePregnancyLabResults = (id: string) =>
  useQuery({ queryKey: [...key.pregnancy(id), 'labs'], queryFn: () => api.fetchLabResults(id) });
export const usePregnancySummaries = (id: string) =>
  useQuery({ queryKey: [...key.pregnancy(id), 'summaries'], queryFn: () => api.fetchPregnancySummaries(id) });

// --------------------------------------------------------------------------- Care team + pregnancy mutations
export function useAddBackup(pregnancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { doctorId: string; note: string }) => api.addBackupDoctor(pregnancyId, v.doctorId, v.note),
    onSuccess: () => invalidatePregnancy(qc, pregnancyId),
  });
}

export function useRemoveMember(pregnancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (doctorId: string) => api.removeCareTeamMember(pregnancyId, doctorId),
    onSuccess: () => invalidatePregnancy(qc, pregnancyId),
  });
}

export function useHandOver(pregnancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (doctorId: string) => api.handOverPrimary(pregnancyId, doctorId),
    onSuccess: () => invalidatePregnancy(qc, pregnancyId),
  });
}

export function useUpdatePregnancy(pregnancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      pregnancy?: Parameters<typeof api.updatePregnancy>[1];
      patientId?: string;
      medical?: Parameters<typeof api.updatePatientMedical>[1];
    }) =>
      Promise.all([
        v.pregnancy ? api.updatePregnancy(pregnancyId, v.pregnancy) : undefined,
        v.patientId && v.medical ? api.updatePatientMedical(v.patientId, v.medical) : undefined,
      ]),
    onSuccess: () => invalidatePregnancy(qc, pregnancyId),
  });
}

// --------------------------------------------------------------------------- Visit plan
export function useVisitPlanActions(pregnancyId: string) {
  const qc = useQueryClient();
  const done = () => invalidatePregnancy(qc, pregnancyId);
  return {
    add: useMutation({ mutationFn: api.addExtraVisit, onSuccess: done }),
    update: useMutation({
      mutationFn: (v: { id: string; patch: Parameters<typeof api.updateVisit>[1] }) => api.updateVisit(v.id, v.patch),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: api.deleteVisit, onSuccess: done }),
    applyTemplate: useMutation({
      mutationFn: (schedule: 'standard' | 'high_risk') => api.applyVisitTemplate(pregnancyId, schedule),
      onSuccess: done,
    }),
  };
}

// --------------------------------------------------------------------------- Consultation
export function useConsultationBundle(appointmentId: string) {
  return useQuery({
    queryKey: key.consult(appointmentId),
    queryFn: () => api.fetchConsultationBundle(appointmentId),
    // The form owns the draft while it is open; refetching must not overwrite typing.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });
}

export function useDrugCatalog() {
  return useQuery({ queryKey: key.drugs, queryFn: api.fetchDrugCatalog, staleTime: 10 * 60_000 });
}

export function useSaveConsultation(pregnancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.saveConsultation,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key.pregnancy(pregnancyId) }),
  });
}

export function usePublishConsultation(pregnancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: publishFlow,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key.pregnancy(pregnancyId) });
      void qc.invalidateQueries({ queryKey: ['doctor', 'queue'] });
      void qc.invalidateQueries({ queryKey: key.inbox });
    },
  });
}

// --------------------------------------------------------------------------- Reports
export function useReportDetail(reportId: string) {
  return useQuery({ queryKey: key.report(reportId), queryFn: () => api.fetchReportDetail(reportId) });
}

export function useSignedUrl(path: string | null) {
  return useQuery({
    queryKey: ['doctor', 'signed-url', path],
    enabled: path !== null,
    queryFn: () => api.createSignedUrl(path as string),
    staleTime: 30_000,
    gcTime: 30_000,
  });
}

export function useUploadReport(pregnancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.uploadReport,
    onSuccess: () => invalidatePregnancy(qc, pregnancyId),
  });
}

/** Runs one of the AI Edge Functions; the result carries an error code instead of throwing. */
export function useSummaryFunction(pregnancyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: Parameters<typeof api.invokeSummaryFunction>[0]; body: Record<string, string> }) =>
      api.invokeSummaryFunction(v.name, v.body),
    onSuccess: () => {
      invalidatePregnancy(qc, pregnancyId);
      void qc.invalidateQueries({ queryKey: ['doctor', 'report'] });
      void qc.invalidateQueries({ queryKey: key.inbox });
    },
  });
}

export function useReportActions(reportId: string, pregnancyId: string) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: key.report(reportId) });
    invalidatePregnancy(qc, pregnancyId);
  };
  return {
    addLab: useMutation({ mutationFn: api.addManualLabResult, onSuccess: done }),
    updateLab: useMutation({
      mutationFn: (v: { id: string; patch: Parameters<typeof api.updateLabResult>[1] }) => api.updateLabResult(v.id, v.patch),
      onSuccess: done,
    }),
    deleteLab: useMutation({ mutationFn: api.deleteLabResult, onSuccess: done }),
    comment: useMutation({ mutationFn: (text: string) => api.updateReportComment(reportId, text), onSuccess: done }),
    remove: useMutation({ mutationFn: () => api.softDeleteReport(reportId), onSuccess: done }),
  };
}

// --------------------------------------------------------------------------- AI inbox
export function useInbox() {
  useRealtimeInvalidate({ table: 'ai_summaries', queryKey: key.inbox });
  return useQuery({ queryKey: key.inbox, queryFn: api.fetchInbox });
}

/** Number of drafts waiting for review: the tab badge. */
export function useDraftCount() {
  useRealtimeInvalidate({ table: 'ai_summaries', queryKey: key.draftCount });
  return useQuery({ queryKey: key.draftCount, queryFn: api.fetchDraftCount });
}

export function useSummaryDetail(summaryId: string) {
  return useQuery({
    queryKey: key.summary(summaryId),
    queryFn: () => api.fetchSummaryDetail(summaryId),
    refetchOnWindowFocus: false,
  });
}

export function useReviewSummary(summaryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Parameters<typeof api.reviewAiSummary> extends [string, ...infer R] ? R : never) =>
      api.reviewAiSummary(summaryId, ...v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key.summary(summaryId) });
      void qc.invalidateQueries({ queryKey: key.inbox });
      void qc.invalidateQueries({ queryKey: ['doctor', 'pregnancy'] });
    },
  });
}

// --------------------------------------------------------------------------- Schedule
export function useAvailability() {
  const me = useMyId();
  return useQuery({
    queryKey: [...key.schedule, 'availability'],
    enabled: me !== null,
    queryFn: () => api.fetchAvailability(me as string),
  });
}

export function useTimeOff() {
  const me = useMyId();
  return useQuery({
    queryKey: [...key.schedule, 'time-off'],
    enabled: me !== null,
    queryFn: () => api.fetchTimeOff(me as string, new Date().toISOString()),
  });
}

export function useTimeOffClashes() {
  const me = useMyId();
  const timeOff = useTimeOff();
  return useQuery({
    queryKey: [...key.schedule, 'clashes', timeOff.data?.map((t) => t.id).join(',') ?? ''],
    enabled: me !== null && timeOff.data !== undefined && timeOff.data.length > 0,
    queryFn: async () => {
      const rows = timeOff.data ?? [];
      const all = await Promise.all(rows.map((t) => api.fetchAppointmentsBetween(me as string, t.starts_at, t.ends_at)));
      return Object.fromEntries(rows.map((t, i) => [t.id, all[i] ?? []]));
    },
  });
}

export function useAcceptingNewPatients() {
  const me = useMyId();
  return useQuery({
    queryKey: [...key.schedule, 'accepting'],
    enabled: me !== null,
    queryFn: () => api.fetchAcceptingNewPatients(me as string),
  });
}

export function useScheduleActions() {
  const me = useMyId();
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: key.schedule });
  return {
    saveAvailability: useMutation({
      mutationFn: (row: Parameters<typeof api.saveAvailability>[1]) => api.saveAvailability(me as string, row),
      onSuccess: done,
    }),
    deleteAvailability: useMutation({ mutationFn: api.deleteAvailability, onSuccess: done }),
    addTimeOff: useMutation({
      mutationFn: (v: { startsAt: string; endsAt: string; reason: string }) =>
        api.addTimeOff(me as string, v.startsAt, v.endsAt, v.reason),
      onSuccess: done,
    }),
    deleteTimeOff: useMutation({ mutationFn: api.deleteTimeOff, onSuccess: done }),
    setAccepting: useMutation({
      mutationFn: (value: boolean) => api.setAcceptingNewPatients(me as string, value),
      onSuccess: done,
    }),
  };
}

/** Appointments of mine that would clash with a time-off range being added (preview before saving). */
export async function previewClashes(doctorId: string, startsAt: string, endsAt: string) {
  return await api.fetchAppointmentsBetween(doctorId, startsAt, endsAt);
}
