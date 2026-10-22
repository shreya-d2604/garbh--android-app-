// TanStack Query hooks for the patient area. Keys start with ['patient', ...] (AGENTS.md §4).
// Appointments refresh live through Realtime; everything else refetches on mutation or pull.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { todayISO } from '@/domain/pregnancy-math';
import { useRealtimeInvalidate } from '@/lib/realtime';
import { useSession } from '@/lib/session';

import * as api from './api';
import type { BookArgs, RescheduleArgs } from './api';
import { slotRange } from './booking';
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
