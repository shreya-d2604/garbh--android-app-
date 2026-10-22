// Client-side permission helpers. These only decide what to SHOW; RLS is the security boundary.
import type { Database } from '@/types/database';

export type UserRole = Database['public']['Enums']['user_role'];
export type CompanionLink = Database['public']['Tables']['companion_links']['Row'];

export const STAFF_ROLES: readonly UserRole[] = ['admin', 'doctor', 'receptionist'];

/** First URL segment of each role's area (app/<segment>/...). */
export const ROLE_SEGMENT: Record<UserRole, string> = {
  patient: 'patient',
  companion: 'companion',
  doctor: 'doctor',
  receptionist: 'reception',
  admin: 'admin',
};

export function isStaffRole(role: UserRole | null | undefined): boolean {
  return role != null && STAFF_ROLES.includes(role);
}

/** Patients, companions and not-yet-onboarded users must accept consent in-app (PLAN.md §7.1). */
export function requiresConsent(role: UserRole | null | undefined): boolean {
  return !isStaffRole(role);
}

export type CompanionSection =
  'appointments' | 'journey' | 'summaries' | 'reports' | 'prescriptions';

type CompanionFlag =
  | 'can_view_appointments'
  | 'can_view_journey'
  | 'can_view_summaries'
  | 'can_view_reports'
  | 'can_view_prescriptions';

const SECTION_FLAG: Record<CompanionSection, CompanionFlag> = {
  appointments: 'can_view_appointments',
  journey: 'can_view_journey',
  summaries: 'can_view_summaries',
  reports: 'can_view_reports',
  prescriptions: 'can_view_prescriptions',
};

/** Sections are HIDDEN (not disabled) when this is false (PLAN.md §7.3). */
export function companionCanView(
  link: Pick<CompanionLink, 'status' | CompanionFlag> | null | undefined,
  section: CompanionSection,
): boolean {
  if (!link || link.status !== 'approved') return false;
  return link[SECTION_FLAG[section]];
}
