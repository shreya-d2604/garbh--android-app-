// TanStack Query hooks for the patient area. Keys start with ['patient', ...] (AGENTS.md §4).
// Appointments refresh live through Realtime; everything else refetches on mutation or pull.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { todayISO, type ISODate } from '@/domain/pregnancy-math';
import { useRealtimeInvalidate } from '@/lib/realtime';
import { useSession } from '@/lib/session';

import * as api from './api';
import type { BookArgs, RescheduleArgs } from './api';
import { slotRange } from './booking';
import { mergeCareGuide, patientConditionTags, type CareGuide } from './care-guide';
import { buildMilestonePath, journeySnapshot, type PathNode } from './journey';
import { groupPrescriptions, type PrescriptionGroup } from './medicines';
import { buildTrends, type Trends } from './reports';
import { parseSummary } from './summary';
import type { CareTeamMember, DoctorEntry } from './types';

/** What the screens need from a query (a subset of UseQueryResult, also built from two queries). */
export interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  isRefetching: boolean;
  refetch: () => void;
}

const STATIC_STALE = 10 * 60_000; // catalogs change rarely

function useUserId(): string | undefined {
  return useSession((s) => s.profile?.id);
}

/** Pull-to-refresh for a screen: refetches every active patient query. */
export function usePullToRefresh() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void queryClient
      .invalidateQueries({ queryKey: ['patient'] })
      .finally(() => setRefreshing(false));
  }, [queryClient]);
  return { refreshing, onRefresh };
}

// ------------------------------------------------------------------ context

export function usePatientContext() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['patient', 'context', userId],
    queryFn: () => api.fetchPatientContext(userId as string),
    enabled: !!userId,
  });
}

/** The active pregnancy id, once the context has loaded (undefined otherwise). */
export function usePregnancyId(): string | undefined {
  return usePatientContext().data?.pregnancy?.id;
}

/** Live updates for the patient's appointments (PLAN.md §8.5): mount once in the area layout. */
export function usePatientRealtime(): void {
  const patientId = usePatientContext().data?.patient.id;
  const filter = `patient_id=eq.${patientId}`;
  useRealtimeInvalidate({
    table: 'appointments',
    filter,
    queryKey: ['patient', 'appointments'],
    enabled: !!patientId,
  });
  // A booking or cancellation also moves the linked visit (planned <-> scheduled).
  useRealtimeInvalidate({
    table: 'appointments',
    filter,
    queryKey: ['patient', 'visits'],
    enabled: !!patientId,
  });
}

// ------------------------------------------------------------------ doctors

export function useDoctorDirectory() {
  return useQuery({
    queryKey: ['patient', 'doctors'],
    queryFn: api.fetchDoctorDirectory,
    staleTime: STATIC_STALE,
  });
}

/** id -> doctor, for showing "Dr. X" next to appointments and summaries. */
export function useDoctorMap(): Map<string, DoctorEntry> {
  const { data } = useDoctorDirectory();
  return useMemo(() => new Map((data ?? []).map((d) => [d.id, d])), [data]);
}

export function useCareTeam(): QueryState<CareTeamMember[]> {
  const pregnancyId = usePregnancyId();
  const team = useQuery({
    queryKey: ['patient', 'care-team', pregnancyId],
    queryFn: () => api.fetchCareTeam(pregnancyId as string),
    enabled: !!pregnancyId,
  });
  const directory = useDoctorDirectory();
  const data = useMemo(() => {
    if (!team.data) return undefined;
    const byId = new Map((directory.data ?? []).map((d) => [d.id, d]));
    return team.data.map((m) => ({ ...m, doctor: byId.get(m.doctor_id) ?? null }));
  }, [team.data, directory.data]);
  return {
    data: directory.isLoading ? undefined : data,
    isLoading: team.isLoading || directory.isLoading,
    isError: team.isError || directory.isError,
    isRefetching: team.isRefetching || directory.isRefetching,
    refetch: () => {
      void team.refetch();
      void directory.refetch();
    },
  };
}

/** Doctor ids of her active care team; undefined while loading or on error. */
export function useCareTeamDoctorIds(): string[] | undefined {
  const pregnancyId = usePregnancyId();
  const team = useQuery({
    queryKey: ['patient', 'care-team', pregnancyId],
    queryFn: () => api.fetchCareTeam(pregnancyId as string),
    enabled: !!pregnancyId,
  });
  return useMemo(() => team.data?.map((m) => m.doctor_id), [team.data]);
}

// ------------------------------------------------------------------ appointments

export function useAppointments() {
  const patientId = usePatientContext().data?.patient.id;
  return useQuery({
    queryKey: ['patient', 'appointments', 'list', patientId],
    queryFn: () => api.fetchAppointments(patientId as string),
    enabled: !!patientId,
  });
}

export function useAppointment(id: string | undefined) {
  return useQuery({
    queryKey: ['patient', 'appointments', 'detail', id],
    queryFn: () => api.fetchAppointment(id as string),
    enabled: !!id,
  });
}

export function useSlots(doctorId: string | null, maxAdvanceDays: number) {
  const { from, to } = slotRange(todayISO(), maxAdvanceDays);
  return useQuery({
    queryKey: ['patient', 'slots', doctorId, from, to],
    queryFn: () => api.fetchSlots(doctorId as string, from, to),
    enabled: !!doctorId,
    // Slots go stale quickly: another patient or the desk may take one at any moment.
    staleTime: 0,
  });
}

function useInvalidateBookings() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['patient', 'appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['patient', 'visits'] }),
      queryClient.invalidateQueries({ queryKey: ['patient', 'care-team'] }),
      queryClient.invalidateQueries({ queryKey: ['patient', 'slots'] }),
    ]);
}

export function useBookAppointment() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (args: BookArgs) => api.bookAppointment(args),
    onSuccess: invalidate,
  });
}

export function useRescheduleAppointment() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (args: RescheduleArgs) => api.rescheduleAppointment(args),
    onSuccess: invalidate,
  });
}

export function useCancelAppointment() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (args: { appointmentId: string; reason: string }) =>
      api.cancelAppointment(args.appointmentId, args.reason),
    onSuccess: invalidate,
  });
}

// ------------------------------------------------------------------ journey

export function useVisits() {
  const pregnancyId = usePregnancyId();
  return useQuery({
    queryKey: ['patient', 'visits', pregnancyId],
    queryFn: () => api.fetchVisits(pregnancyId as string),
    enabled: !!pregnancyId,
  });
}

export function useMilestones() {
  return useQuery({
    queryKey: ['patient', 'milestones'],
    queryFn: api.fetchMilestones,
    staleTime: STATIC_STALE,
  });
}

/** Milestone path for the journey screen: visits joined with milestones around today's GA. */
export function useMilestonePath(edd: ISODate, rhNegative: boolean | null): QueryState<PathNode[]> {
  const visits = useVisits();
  const milestones = useMilestones();
  const today = todayISO();
  const data = useMemo(() => {
    if (!visits.data || !milestones.data) return undefined;
    const { ga } = journeySnapshot(edd, today);
    return buildMilestonePath({
      visits: visits.data,
      milestones: milestones.data,
      ga,
      today,
      rhNegative,
    });
  }, [visits.data, milestones.data, edd, today, rhNegative]);
  return {
    data,
    isLoading: visits.isLoading || milestones.isLoading,
    isError: visits.isError || milestones.isError,
    isRefetching: visits.isRefetching || milestones.isRefetching,
    refetch: () => {
      void visits.refetch();
      void milestones.refetch();
    },
  };
}

export function useWeekContent() {
  return useQuery({
    queryKey: ['patient', 'week-content'],
    queryFn: api.fetchWeekContent,
    staleTime: STATIC_STALE,
  });
}

// ------------------------------------------------------------------ summaries, medicines, guide

export function usePublishedSummaries() {
  const pregnancyId = usePregnancyId();
  return useQuery({
    queryKey: ['patient', 'summaries', pregnancyId],
    queryFn: () => api.fetchPublishedSummaries(pregnancyId as string),
    enabled: !!pregnancyId,
  });
}

export function usePublishedSummary(id: string | undefined) {
  return useQuery({
    queryKey: ['patient', 'summary', id],
    queryFn: () => api.fetchPublishedSummary(id as string),
    enabled: !!id,
  });
}

export function useConsultations() {
  const pregnancyId = usePregnancyId();
  return useQuery({
    queryKey: ['patient', 'consultations', pregnancyId],
    queryFn: () => api.fetchConsultations(pregnancyId as string),
    enabled: !!pregnancyId,
  });
}

export function usePrescriptionItems() {
  const pregnancyId = usePregnancyId();
  return useQuery({
    queryKey: ['patient', 'prescription-items', pregnancyId],
    queryFn: () => api.fetchPrescriptionItems(pregnancyId as string),
    enabled: !!pregnancyId,
  });
}

export function useGuidance() {
  return useQuery({
    queryKey: ['patient', 'guidance'],
    queryFn: api.fetchGuidance,
    staleTime: STATIC_STALE,
  });
}

// ------------------------------------------------------------------ reports

export function useReports() {
  const pregnancyId = usePregnancyId();
  return useQuery({
    queryKey: ['patient', 'reports', 'list', pregnancyId],
    queryFn: () => api.fetchReports(pregnancyId as string),
    enabled: !!pregnancyId,
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: ['patient', 'reports', 'detail', id],
    queryFn: () => api.fetchReport(id as string),
    enabled: !!id,
  });
}

export function useReportFiles(reportId: string | undefined) {
  return useQuery({
    queryKey: ['patient', 'reports', 'files', reportId],
    queryFn: () => api.fetchReportFiles(reportId as string),
    enabled: !!reportId,
  });
}

export function useReportLabResults(reportId: string | undefined) {
  return useQuery({
    queryKey: ['patient', 'reports', 'labs', reportId],
    queryFn: () => api.fetchReportLabResults(reportId as string),
    enabled: !!reportId,
  });
}

export function usePregnancyLabResults() {
  const pregnancyId = usePregnancyId();
  return useQuery({
    queryKey: ['patient', 'trends', 'labs', pregnancyId],
    queryFn: () => api.fetchPregnancyLabResults(pregnancyId as string),
    enabled: !!pregnancyId,
  });
}

export function useLabTests() {
  return useQuery({
    queryKey: ['patient', 'lab-tests'],
    queryFn: api.fetchLabTests,
    staleTime: STATIC_STALE,
  });
}

/** A fresh signed link per viewing: it expires in 60 seconds, so it is never cached. */
export function useReportFileUrl(storagePath: string | undefined) {
  return useQuery({
    queryKey: ['patient', 'file-url', storagePath],
    queryFn: () => api.createReportFileUrl(storagePath as string),
    enabled: !!storagePath,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

// ------------------------------------------------------------------ combined views

/** Chart series: verified lab values plus vitals from published consultations. */
export function useTrends(edd: ISODate): QueryState<Trends> {
  const labs = usePregnancyLabResults();
  const consultations = useConsultations();
  const data = useMemo(
    () =>
      labs.data && consultations.data ? buildTrends(labs.data, consultations.data, edd) : undefined,
    [labs.data, consultations.data, edd],
  );
  return {
    data,
    isLoading: labs.isLoading || consultations.isLoading,
    isError: labs.isError || consultations.isError,
    isRefetching: labs.isRefetching || consultations.isRefetching,
    refetch: () => {
      void labs.refetch();
      void consultations.refetch();
    },
  };
}

export interface CareGuideData {
  guide: CareGuide;
  /** Name of the doctor who approved the latest summary, if known. */
  doctorName: string | null;
}

/** Curated guidance merged with the latest published summary (PLAN.md §7.2 #6). */
export function useCareGuide(
  trimester: number,
  chronicConditions: string[],
  riskFactors: string[],
): QueryState<CareGuideData> {
  const curated = useGuidance();
  const summaries = usePublishedSummaries();
  const doctors = useDoctorMap();
  const data = useMemo(() => {
    if (!curated.data || !summaries.data) return undefined;
    const latest = summaries.data[0];
    const summary = latest ? parseSummary(latest.final) : null;
    const guide = mergeCareGuide({
      curated: curated.data,
      summary,
      trimester,
      tags: patientConditionTags(chronicConditions, riskFactors),
    });
    const doctorName = latest?.reviewed_by
      ? (doctors.get(latest.reviewed_by)?.full_name ?? null)
      : null;
    return { guide, doctorName };
  }, [curated.data, summaries.data, doctors, trimester, chronicConditions, riskFactors]);
  return {
    data,
    isLoading: curated.isLoading || summaries.isLoading,
    isError: curated.isError || summaries.isError,
    isRefetching: curated.isRefetching || summaries.isRefetching,
    refetch: () => {
      void curated.refetch();
      void summaries.refetch();
    },
  };
}

export interface PrescriptionData {
  /** All items (for "today's medicines"). */
  items: PrescriptionGroup['items'];
  groups: PrescriptionGroup[];
}

/** Medicines and per-visit history (PLAN.md §7.2 #7). */
export function usePrescriptions(): QueryState<PrescriptionData> {
  const consultations = useConsultations();
  const items = usePrescriptionItems();
  const data = useMemo(
    () =>
      consultations.data && items.data
        ? { items: items.data, groups: groupPrescriptions(consultations.data, items.data) }
        : undefined,
    [consultations.data, items.data],
  );
  return {
    data,
    isLoading: consultations.isLoading || items.isLoading,
    isError: consultations.isError || items.isError,
    isRefetching: consultations.isRefetching || items.isRefetching,
    refetch: () => {
      void consultations.refetch();
      void items.refetch();
    },
  };
}
