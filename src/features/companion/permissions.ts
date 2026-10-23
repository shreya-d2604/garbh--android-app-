// Per-companion permission toggles (PLAN.md §7.2 #8) and their mapping to companion_links columns.
import type { CompanionLink } from '@/domain/permissions';

export const PERMISSION_KEYS = [
  'appointments',
  'journey',
  'summaries',
  'reports',
  'prescriptions',
  'notifications',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionState = Record<PermissionKey, boolean>;

/** Suggested toggles when approving: the less sensitive sections on, reports/prescriptions off. */
export const DEFAULT_PERMISSIONS: PermissionState = {
  appointments: true,
  journey: true,
  summaries: true,
  reports: false,
  prescriptions: false,
  notifications: true,
};

type PermissionColumns = Pick<
  CompanionLink,
  | 'can_view_appointments'
  | 'can_view_journey'
  | 'can_view_summaries'
  | 'can_view_reports'
  | 'can_view_prescriptions'
  | 'receive_notifications'
>;

export function permissionsFromLink(link: PermissionColumns): PermissionState {
  return {
    appointments: link.can_view_appointments,
    journey: link.can_view_journey,
    summaries: link.can_view_summaries,
    reports: link.can_view_reports,
    prescriptions: link.can_view_prescriptions,
    notifications: link.receive_notifications,
  };
}

/** The `p_perms` argument of decide_companion_link: every key explicit (missing would mean false). */
export function permissionsPayload(state: PermissionState): Record<PermissionKey, boolean> {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, state[k]])) as Record<
    PermissionKey,
    boolean
  >;
}

export function samePermissions(a: PermissionState, b: PermissionState): boolean {
  return PERMISSION_KEYS.every((k) => a[k] === b[k]);
}

/** Keys that are switched on, in display order (used for "Can see: ..." summaries). */
export function enabledPermissions(state: PermissionState): PermissionKey[] {
  return PERMISSION_KEYS.filter((k) => state[k]);
}
