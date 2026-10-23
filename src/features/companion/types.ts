import type { Database } from '@/types/database';

type Tables = Database['public']['Tables'];

export type LinkRow = Tables['companion_links']['Row'];
export type LinkStatus = LinkRow['status'];

/** A companion's own link plus the patient's name (null until the link is approved: RLS). */
export interface CompanionLinkView extends LinkRow {
  patient_name: string | null;
}

/** A patient-side link plus the companion's name. */
export interface PatientLinkView extends LinkRow {
  companion_name: string | null;
}
