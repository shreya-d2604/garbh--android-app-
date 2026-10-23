// TanStack Query hooks for the reception area. Query keys all start with ['reception'] so one
// realtime subscription on `appointments` (see app/reception/_layout.tsx) refreshes every screen.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { todayISO, type ISODate } from '@/domain/pregnancy-math';

import * as api from './api';
import { appointmentsAffectedByTimeOff } from './calendar';
import type { DuplicateInput } from './duplicates';
import { sortVerifyQueue } from './verify-queue';
import { DUE_WINDOW_DAYS, selectVisitsDue } from './visits-due';

export const receptionKey = ['reception'] as const;

/** Time off and visit plans are not in the realtime publication: refetch when a tab gets focus. */
export function useRefetchOnFocus(refetch: () => unknown) {
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
}

export function useDoctors() {
  return useQuery({
    queryKey: [...receptionKey, 'doctors'],
    queryFn: api.fetchDoctors,
    staleTime: 5 * 60_000,
  });
}

export function useDayAppointments(date: ISODate, doctorId?: string) {
  return useQuery({
    queryKey: [...receptionKey, 'appointments', date, doctorId ?? 'all'],
    queryFn: () => api.fetchDayAppointments(date, doctorId),
  });
}

export function useAppointment(id: string | undefined) {
  return useQuery({
    queryKey: [...receptionKey, 'appointment', id],
    queryFn: () => api.fetchAppointment(id as string),
    enabled: !!id,
  });
}

export function useFreeSlots(doctorId: string | undefined, from: ISODate, to: ISODate) {
  return useQuery({
    queryKey: [...receptionKey, 'slots', doctorId, from, to],
    queryFn: () => api.fetchFreeSlots(doctorId as string, from, to),
    enabled: !!doctorId,
  });
}

export function useVerifyQueue() {
  const today = todayISO();
  const queue = useQuery({ queryKey: [...receptionKey, 'verify'], queryFn: api.fetchVerifyQueue });
  const arrivals = useQuery({
    queryKey: [...receptionKey, 'appointments', today, 'all'],
    queryFn: () => api.fetchDayAppointments(today),
  });
  const data = useMemo(
    () =>
      queue.data
        ? sortVerifyQueue(queue.data, new Set((arrivals.data ?? []).map((a) => a.patient_id)))
        : undefined,
    [queue.data, arrivals.data],
  );
  return {
    data,
    isPending: queue.isPending,
    isError: queue.isError,
    isRefetching: queue.isRefetching,
    refetch: async () => {
      await Promise.all([queue.refetch(), arrivals.refetch()]);
    },
  };
}

export function useQueuePatient(id: string | undefined) {
  return useQuery({
    queryKey: [...receptionKey, 'queue-patient', id],
    queryFn: () => api.fetchQueuePatient(id as string),
    enabled: !!id,
  });
}

export function usePatientSearch(term: string, options: { deskRecordsOnly?: boolean } = {}) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: [...receptionKey, 'patient-search', trimmed, !!options.deskRecordsOnly],
    queryFn: () => api.searchPatients(trimmed, options),
    enabled: trimmed.length >= 2,
  });
}

export function usePatientContext(patientId: string | undefined) {
  return useQuery({
    queryKey: [...receptionKey, 'patient-context', patientId],
    queryFn: () => api.fetchPatientContext(patientId as string),
    enabled: !!patientId,
  });
}

export function useVisitsDue() {
  const today = todayISO();
  const query = useQuery({
    queryKey: [...receptionKey, 'visits-due', today],
    queryFn: () => api.fetchDueVisits(today, DUE_WINDOW_DAYS),
  });
  const data = useMemo(
    () => (query.data ? selectVisitsDue(query.data, today, DUE_WINDOW_DAYS) : undefined),
    [query.data, today],
  );
  return { ...query, data };
}

export function useDoctorUnavailable() {
  const query = useQuery({
    queryKey: [...receptionKey, 'unavailable'],
    queryFn: () => api.fetchTimeOffImpact(new Date().toISOString()),
  });
  const data = useMemo(
    () =>
      query.data
        ? appointmentsAffectedByTimeOff(query.data.appointments, query.data.timeOff)
        : undefined,
    [query.data],
  );
  return { ...query, data };
}

export function useDuplicateCheck() {
  return useMutation({ mutationFn: (input: DuplicateInput) => api.findDuplicatePatients(input) });
}

export function useSuggestedMrn(enabled: boolean) {
  return useQuery({
    queryKey: [...receptionKey, 'next-mrn'],
    queryFn: api.suggestMrn,
    enabled,
    staleTime: 0,
  });
}

// ---------------------------------------------------------------- mutations

/** Every write refreshes all reception queries (counts, calendar, worklists). */
function useReceptionMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: receptionKey }),
  });
}

export const useBookAppointment = () => useReceptionMutation(api.bookAppointment);
export const useRescheduleAppointment = () => useReceptionMutation(api.rescheduleAppointment);
export const useCancelAppointment = () => useReceptionMutation(api.cancelAppointment);
export const useSetAppointmentStatus = () => useReceptionMutation(api.setAppointmentStatus);
export const useVerifyPatient = () => useReceptionMutation(api.verifyPatient);
export const useRegisterPatient = () => useReceptionMutation(api.registerPatient);
export const useMarkVisitContacted = () => useReceptionMutation(api.markVisitContacted);
export const useUpdatePatientDetails = () =>
  useReceptionMutation(
    (a: { id: string; values: Parameters<typeof api.updatePatientDetails>[1] }) =>
      api.updatePatientDetails(a.id, a.values),
  );
