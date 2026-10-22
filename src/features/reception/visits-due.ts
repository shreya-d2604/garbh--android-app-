// Visits-due worklist (PLAN.md §7.5 #4): planned visits whose window opens within 14 days and that
// have no appointment yet, plus overdue ones. Patients who self-book drop off automatically
// because booking turns the visit into "scheduled".
import { addDays, type ISODate } from '@/domain/pregnancy-math';

export const DUE_WINDOW_DAYS = 14;

export interface DueVisit {
  id: string;
  status: string;
  appointment_id: string | null;
  due_from: ISODate | null;
  due_to: ISODate | null;
}

export type DueKind = 'overdue' | 'open' | 'soon';

/**
 * overdue = the window has closed (or the visit was marked missed), open = the window is open now,
 * soon = it opens within `windowDays`. null = not on the worklist.
 */
export function dueKind(v: DueVisit, today: ISODate, windowDays = DUE_WINDOW_DAYS): DueKind | null {
  if (v.appointment_id) return null;
  if (v.status !== 'planned' && v.status !== 'missed') return null;
  if (v.status === 'missed' || (v.due_to !== null && v.due_to < today)) return 'overdue';
  if (v.due_from === null) return null;
  if (v.due_from <= today) return 'open';
  return v.due_from <= addDays(today, windowDays) ? 'soon' : null;
}

const ORDER: Record<DueKind, number> = { overdue: 0, open: 1, soon: 2 };

/** Visits on the worklist, most urgent first (overdue, then open, then opening soon; earliest window first). */
export function selectVisitsDue<V extends DueVisit>(
  visits: readonly V[],
  today: ISODate,
  windowDays = DUE_WINDOW_DAYS,
): (V & { kind: DueKind })[] {
  const result: (V & { kind: DueKind })[] = [];
  for (const v of visits) {
    const kind = dueKind(v, today, windowDays);
    if (kind) result.push({ ...v, kind });
  }
  return result.sort(
    (a, b) =>
      ORDER[a.kind] - ORDER[b.kind] ||
      (a.due_from ?? '').localeCompare(b.due_from ?? '') ||
      a.id.localeCompare(b.id),
  );
}
