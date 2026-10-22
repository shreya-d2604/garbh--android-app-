// Home-screen alerts (PLAN.md §7.2 #1): a planned visit whose window is open and not booked.
import { diffDays, type ISODate } from '@/domain/pregnancy-math';

import type { Visit } from './types';

export interface HomeAlert {
  key: string;
  kind: 'visit_due' | 'visit_overdue';
  visitId: string;
  title: string;
  dueFrom: ISODate | null;
  dueTo: ISODate | null;
  tests: string[];
}

/** A window that ended longer ago than this is history, not an alert (late registrations). */
export const OVERDUE_RECENT_DAYS = 14;

export function homeAlerts(visits: Visit[], today: ISODate, limit = 3): HomeAlert[] {
  const alerts: HomeAlert[] = [];
  for (const v of visits) {
    if (v.status !== 'planned' || v.appointment_id) continue;
    const open = v.due_from != null && v.due_to != null && v.due_from <= today && today <= v.due_to;
    const overdue =
      v.due_to != null && v.due_to < today && diffDays(today, v.due_to) <= OVERDUE_RECENT_DAYS;
    if (!open && !overdue) continue;
    alerts.push({
      key: `visit:${v.id}`,
      kind: open ? 'visit_due' : 'visit_overdue',
      visitId: v.id,
      title: v.title,
      dueFrom: v.due_from,
      dueTo: v.due_to,
      tests: v.recommended_tests,
    });
  }
  // Overdue first, then the window that closes soonest.
  alerts.sort(
    (a, b) =>
      Number(b.kind === 'visit_overdue') - Number(a.kind === 'visit_overdue') ||
      (a.dueTo ?? '').localeCompare(b.dueTo ?? ''),
  );
  return alerts.slice(0, limit);
}
