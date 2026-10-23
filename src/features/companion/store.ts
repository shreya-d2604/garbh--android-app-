// Which patient a companion is looking at, and which screen /companion should show.
import { create } from 'zustand';

import type { LinkRow } from './types';

export interface SelectionState {
  selectedPatientId: string | null;
  select: (patientId: string | null) => void;
}

/** Selected patient for the switcher. In memory only: it is re-validated against live links. */
export const useCompanionSelection = create<SelectionState>((set) => ({
  selectedPatientId: null,
  select: (patientId) => set({ selectedPatientId: patientId }),
}));

type LinkLike = Pick<LinkRow, 'patient_id' | 'status' | 'requested_at'>;

export function approvedLinks<T extends LinkLike>(links: readonly T[]): T[] {
  return links.filter((l) => l.status === 'approved');
}

/** The selected patient if still approved, otherwise the first approved one (links are oldest first). */
export function resolveSelectedPatientId(
  links: readonly LinkLike[],
  selectedPatientId: string | null,
): string | null {
  const approved = approvedLinks(links);
  if (selectedPatientId && approved.some((l) => l.patient_id === selectedPatientId)) {
    return selectedPatientId;
  }
  return approved[0]?.patient_id ?? null;
}

export type Gateway =
  | { kind: 'approved'; patientId: string }
  | { kind: 'waiting'; pendingLinkIds: string[] }
  /** Show the code entry. `notice` explains why the companion is back here. */
  | { kind: 'join'; notice: 'rejected' | 'revoked' | null };

export function resolveGateway(
  links: readonly (LinkLike & Pick<LinkRow, 'id'>)[],
  selectedPatientId: string | null,
): Gateway {
  const patientId = resolveSelectedPatientId(links, selectedPatientId);
  if (patientId) return { kind: 'approved', patientId };

  const pending = links.filter((l) => l.status === 'pending');
  if (pending.length > 0) return { kind: 'waiting', pendingLinkIds: pending.map((l) => l.id) };

  const latest = [...links].sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0];
  const notice =
    latest?.status === 'rejected' || latest?.status === 'revoked' ? latest.status : null;
  return { kind: 'join', notice };
}
