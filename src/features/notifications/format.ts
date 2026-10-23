// Pure helpers for the notification inbox (unit-tested without React).
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatDistance } from 'date-fns';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICONS: Record<string, IconName> = {
  appointment_booked: 'calendar-check-outline',
  appointment_changed: 'calendar-edit',
  appointment_cancelled: 'calendar-remove-outline',
  appointment_reminder: 'bell-ring-outline',
  consultation_published: 'clipboard-text-outline',
  summary_published: 'file-document-outline',
  report_added: 'file-upload-outline',
  account_verified: 'check-decagram-outline',
  visit_due: 'calendar-clock',
  companion_request: 'account-multiple-plus-outline',
  companion_approved: 'account-check-outline',
  companion_revoked: 'account-off-outline',
  week_update: 'baby-face-outline',
  trimester_change: 'baby-face-outline',
  ai_draft_ready: 'creation',
  patient_checked_in: 'account-check',
  care_team_changed: 'account-switch-outline',
  data_quality: 'alert-circle-outline',
};

export function notificationIcon(type: string): IconName {
  return ICONS[type] ?? 'bell-outline';
}

/**
 * The deep link carried by a notification (`data.route`), or null. Only in-app paths are
 * accepted so a crafted row can never push the app to an external URL or another scheme.
 */
export function internalRoute(data: unknown): string | null {
  const route = (data as { route?: unknown } | null | undefined)?.route;
  if (typeof route !== 'string') return null;
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('://')) return null;
  return route;
}

/** "5 minutes ago", "about 3 hours ago", "2 days ago". */
export function relativeTime(createdAt: string, now: Date = new Date()): string {
  return formatDistance(new Date(createdAt), now, { addSuffix: true });
}
