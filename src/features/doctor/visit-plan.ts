// Visit plan editor (PLAN.md §5.4, §7.4 #7). Pure.
import { z } from 'zod';

import { addDays, visitWindow, type ISODate } from '@/domain/pregnancy-math';
import type { TablesInsert } from '@/types/database';

import { parseList } from './format';
import type { VisitRow } from './types';

export const MIN_WEEK = 4;
export const MAX_WEEK = 42;

export const extraVisitSchema = z.object({
  week: z
    .string()
    .refine(
      (v) => /^\d{1,2}$/.test(v.trim()) && Number(v) >= MIN_WEEK && Number(v) <= MAX_WEEK,
      { error: 'doctor:validation.week' },
    ),
  title: z.string(),
  reason: z.string().trim().min(2, { error: 'validation.required' }),
  tests: z.string(),
});
export type ExtraVisitValues = z.infer<typeof extraVisitSchema>;

export const EMPTY_EXTRA_VISIT: ExtraVisitValues = { week: '', title: '', reason: '', tests: '' };

/** Visits in plan order: by due date, then sequence; undated ones last. */
export function sortVisits<T extends Pick<VisitRow, 'due_from' | 'seq'>>(visits: readonly T[]): T[] {
  return [...visits].sort((a, b) => {
    const da = a.due_from ?? '9999-12-31';
    const db = b.due_from ?? '9999-12-31';
    return da === db ? a.seq - b.seq : da.localeCompare(db);
  });
}

/** Insert payload for an extra visit in week `week` (window = that whole week). */
export function buildExtraVisit(args: {
  pregnancyId: string;
  edd: ISODate;
  addedBy: string;
  existing: readonly Pick<VisitRow, 'seq'>[];
  values: ExtraVisitValues;
  defaultTitle: string;
}): TablesInsert<'visits'> {
  const week = Number(args.values.week);
  const { dueFrom, dueTo } = visitWindow(args.edd, week, week);
  return {
    pregnancy_id: args.pregnancyId,
    seq: args.existing.reduce((m, v) => Math.max(m, v.seq), 0) + 1,
    target_week: week,
    due_from: dueFrom,
    due_to: dueTo,
    title: args.values.title.trim() || args.defaultTitle,
    purpose: args.values.reason.trim(),
    reason_added: args.values.reason.trim(),
    recommended_tests: parseList(args.values.tests),
    is_extra: true,
    added_by: args.addedBy,
    status: 'planned',
  };
}

/** Move a visit's whole window by whole weeks; null when it has no dates or would leave 4..42 weeks. */
export function shiftVisit(
  visit: Pick<VisitRow, 'target_week' | 'due_from' | 'due_to'>,
  deltaWeeks: number,
): { target_week: number; due_from: ISODate; due_to: ISODate } | null {
  if (!visit.due_from || !visit.due_to) return null;
  const week = visit.target_week + deltaWeeks;
  if (week < MIN_WEEK || week > MAX_WEEK) return null;
  return {
    target_week: week,
    due_from: addDays(visit.due_from, deltaWeeks * 7),
    due_to: addDays(visit.due_to, deltaWeeks * 7),
  };
}

export type VisitState =
  | 'completed'
  | 'scheduled'
  | 'skipped'
  | 'cancelled'
  | 'missed'
  | 'overdue'
  | 'due'
  | 'upcoming';

export function visitState(
  visit: Pick<VisitRow, 'status' | 'due_from' | 'due_to'>,
  today: ISODate,
): VisitState {
  if (visit.status !== 'planned') return visit.status;
  if (visit.due_to && visit.due_to < today) return 'overdue';
  if (visit.due_from && visit.due_from <= today) return 'due';
  return 'upcoming';
}

/** Statuses a doctor can still change by hand. */
export function isEditable(visit: Pick<VisitRow, 'status'>): boolean {
  return visit.status !== 'completed';
}

/** Extra visits can be deleted until they are completed; template visits are skipped or cancelled. */
export function canDeleteVisit(visit: Pick<VisitRow, 'status' | 'is_extra'>): boolean {
  return visit.is_extra && visit.status !== 'completed';
}
