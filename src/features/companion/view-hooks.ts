// Read-only data hooks for the companion screens, keyed by patient: ['companion', patientId, ...].
// Pass `enabled = false` for sections the link does not allow (they are hidden, never fetched).
import { useQuery } from '@tanstack/react-query';

import {
  fetchActivePregnancy,
  fetchAppointments,
  fetchLabResults,
  fetchPregnancyIds,
  fetchPrescriptionItems,
  fetchPublishedConsultations,
  fetchPublishedSummaries,
  fetchReports,
  fetchVisits,
  fetchWeekContent,
} from './view-api';

export function useActivePregnancy(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['companion', patientId, 'pregnancy'],
    queryFn: () => fetchActivePregnancy(patientId),
    enabled,
  });
}

export function useWeekContent(patientId: string, weeks: number | null) {
  return useQuery({
    queryKey: ['companion', patientId, 'week-content', weeks],
    queryFn: () => fetchWeekContent(weeks ?? 0),
    enabled: weeks != null,
  });
}

export function useVisits(patientId: string, pregnancyId: string | undefined) {
  return useQuery({
    queryKey: ['companion', patientId, 'visits', pregnancyId],
    queryFn: () => fetchVisits(pregnancyId ?? ''),
    enabled: !!pregnancyId,
  });
}

export function useAppointments(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['companion', patientId, 'appointments'],
    queryFn: () => fetchAppointments(patientId),
    enabled,
  });
}

export function useSummaries(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['companion', patientId, 'summaries'],
    queryFn: async () => {
      const ids = await fetchPregnancyIds(patientId);
      const [summaries, consultations] = await Promise.all([
        fetchPublishedSummaries(ids),
        fetchPublishedConsultations(ids),
      ]);
      return { summaries, consultations };
    },
    enabled,
  });
}

export function useReports(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['companion', patientId, 'reports'],
    queryFn: async () => {
      const ids = await fetchPregnancyIds(patientId);
      const reports = await fetchReports(ids);
      const results = await fetchLabResults(reports.map((r) => r.id));
      return { reports, results };
    },
    enabled,
  });
}

export function usePrescriptions(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['companion', patientId, 'prescriptions'],
    queryFn: async () => fetchPrescriptionItems(await fetchPregnancyIds(patientId)),
    enabled,
  });
}
