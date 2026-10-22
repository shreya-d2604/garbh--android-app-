// TanStack Query hooks for links and invites. Query keys start with 'companion'.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRealtimeInvalidate } from '@/lib/realtime';
import { useSession } from '@/lib/session';

import {
  createInvite,
  decideLink,
  endLink,
  fetchActiveInvite,
  fetchCompanionLinks,
  fetchMyPatient,
  fetchPatientLinks,
  redeemCode,
} from './api';
import type { PermissionState } from './permissions';

export const COMPANION_KEY = ['companion'] as const;
export const COMPANION_LINKS_KEY = ['companion', 'links'] as const;
export const PATIENT_KEY = ['companion', 'patient'] as const;

// ---------------------------------------------------------------- companion side

export function useCompanionLinks() {
  const userId = useSession((s) => s.session?.user.id);
  return useQuery({
    queryKey: [...COMPANION_LINKS_KEY, userId],
    queryFn: () => fetchCompanionLinks(userId ?? ''),
    enabled: !!userId,
  });
}

/** Live link changes for the signed-in companion (approval, rejection, revoke). Mount once. */
export function useCompanionLinksRealtime() {
  const userId = useSession((s) => s.session?.user.id);
  useRealtimeInvalidate({
    table: 'companion_links',
    filter: `companion_user_id=eq.${userId ?? ''}`,
    queryKey: COMPANION_KEY,
    enabled: !!userId,
  });
}

export function useRedeemCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { code: string; relation: string }) => redeemCode(v.code, v.relation),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPANION_KEY });
    },
  });
}

// ---------------------------------------------------------------- patient side

export function useMyPatient() {
  return useQuery({ queryKey: [...PATIENT_KEY, 'me'], queryFn: fetchMyPatient });
}

export function usePatientLinks(patientId: string | undefined) {
  return useQuery({
    queryKey: [...PATIENT_KEY, 'links', patientId],
    queryFn: () => fetchPatientLinks(patientId ?? ''),
    enabled: !!patientId,
  });
}

export function useActiveInvite(patientId: string | undefined) {
  return useQuery({
    queryKey: [...PATIENT_KEY, 'invite', patientId],
    queryFn: () => fetchActiveInvite(patientId ?? ''),
    enabled: !!patientId,
  });
}

/** Live requests / revocations for a patient's own links. Mount once per screen tree. */
export function usePatientLinksRealtime(patientId: string | undefined) {
  useRealtimeInvalidate({
    table: 'companion_links',
    filter: `patient_id=eq.${patientId ?? ''}`,
    queryKey: COMPANION_KEY,
    enabled: !!patientId,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInvite,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PATIENT_KEY });
    },
  });
}

export function useDecideLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { linkId: string; approve: boolean; permissions: PermissionState }) =>
      decideLink(v.linkId, v.approve, v.permissions),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPANION_KEY });
    },
  });
}

/** Patient revokes / companion leaves (the RPC decides by who is calling). */
export function useEndLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => endLink(linkId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPANION_KEY });
    },
  });
}
