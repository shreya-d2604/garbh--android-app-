// Patients tab (PLAN.md §7.4 #2): care-team patients only (RLS), search and filters. Pure.
import type { ISODate } from '@/domain/pregnancy-math';

import { gaFromEdd } from './format';
import type { CareRole, PregnancyStatus, RiskLevel, VisitRow } from './types';

export interface PatientListItem {
  pregnancyId: string;
  patientId: string;
  name: string;
  mrn: string | null;
  verified: boolean;
  dob: string | null;
  careRole: CareRole;
  riskLevel: RiskLevel;
  status: PregnancyStatus;
  eddFinal: string | null;
  overdueVisits: number;
}

export interface PatientFilters {
  query: string;
  role: 'all' | CareRole;
  highRisk: boolean;
  trimester: 1 | 2 | 3 | null;
  overdueOnly: boolean;
  /** false = active pregnancies only; true = closed (delivered, etc.) ones only. */
  closed: boolean;
}

export const DEFAULT_PATIENT_FILTERS: PatientFilters = {
  query: '',
  role: 'all',
  highRisk: false,
  trimester: null,
  overdueOnly: false,
  closed: false,
};

export function hasActiveFilters(f: PatientFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.role !== 'all' ||
    f.highRisk ||
    f.trimester !== null ||
    f.overdueOnly ||
    f.closed
  );
}

/** Planned visits whose window has already ended (the plan was not followed). */
export function countOverdueVisits(
  visits: readonly Pick<VisitRow, 'status' | 'due_to'>[],
  today: ISODate,
): number {
  return visits.filter((v) => v.status === 'planned' && v.due_to != null && v.due_to < today)
    .length;
}

export function applyPatientFilters(
  items: readonly PatientListItem[],
  f: PatientFilters,
  today: ISODate,
): PatientListItem[] {
  const q = f.query.trim().toLowerCase();
  return items
    .filter((i) => (f.closed ? i.status !== 'active' : i.status === 'active'))
    .filter((i) => f.role === 'all' || i.careRole === f.role)
    .filter((i) => !f.highRisk || i.riskLevel === 'high')
    .filter((i) => !f.overdueOnly || i.overdueVisits > 0)
    .filter((i) => f.trimester === null || gaFromEdd(i.eddFinal, today)?.trimester === f.trimester)
    .filter(
      (i) =>
        q === '' || i.name.toLowerCase().includes(q) || (i.mrn ?? '').toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
