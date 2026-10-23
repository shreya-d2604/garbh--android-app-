// Journey data shaping (PLAN.md §7.2 #1-2, §10). Pure functions: GA comes from
// src/domain/pregnancy-math.ts, everything else is joined here so it can be unit-tested.
import {
  gestationalAge,
  isPostTerm,
  progressToEdd,
  type GestationalAge,
  type ISODate,
} from '@/domain/pregnancy-math';

import type { Milestone, Visit, WeekContent } from './types';

export interface JourneySnapshot {
  ga: GestationalAge;
  /** 0..1 progress from day 0 to the EDD. */
  progress: number;
  /** Days until the EDD; negative once past it. */
  daysToGo: number;
  postTerm: boolean;
}

/** GA for display. A date before day 0 (EDD more than 280 days away) is clamped to 0w0d. */
export function journeySnapshot(edd: ISODate, today: ISODate): JourneySnapshot {
  const raw = gestationalAge(edd, today);
  const ga: GestationalAge =
    raw.totalDays < 0 ? { ...raw, weeks: 0, days: 0, trimester: 1, totalDays: 0 } : raw;
  return { ga, progress: progressToEdd(ga), daysToGo: raw.daysToEdd, postTerm: isPostTerm(ga) };
}

/** Content for the week the patient is in: the latest row at or before it (else the first row). */
export function pickWeekContent(rows: WeekContent[], weeks: number): WeekContent | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a.week - b.week);
  let picked: WeekContent | null = null;
  for (const row of sorted) {
    if (row.week <= weeks) picked = row;
  }
  return picked ?? sorted[0] ?? null;
}

// ------------------------------------------------------------------ trimester timeline

export type TimelineKey = 't1' | 't2' | 't3' | 'delivery';
export interface TimelineSegment {
  key: TimelineKey;
  state: 'done' | 'current' | 'upcoming';
  /** 0..1: how much of this segment has passed (only meaningful for the current one). */
  fill: number;
}

const SEGMENTS: { key: 't1' | 't2' | 't3'; startDay: number; endDay: number }[] = [
  { key: 't1', startDay: 0, endDay: 14 * 7 },
  { key: 't2', startDay: 14 * 7, endDay: 28 * 7 },
  { key: 't3', startDay: 28 * 7, endDay: 40 * 7 },
];

/** T1 -> T2 -> T3 -> Delivery with a "you are here" position. */
export function trimesterTimeline(ga: GestationalAge): TimelineSegment[] {
  const segments: TimelineSegment[] = SEGMENTS.map((s) => {
    const fill = Math.min(1, Math.max(0, (ga.totalDays - s.startDay) / (s.endDay - s.startDay)));
    const state =
      ga.totalDays >= s.endDay ? 'done' : ga.totalDays >= s.startDay ? 'current' : 'upcoming';
    return { key: s.key, state, fill: state === 'current' ? fill : state === 'done' ? 1 : 0 };
  });
  // The last trimester ends at the due date; after it the patient is at the "Delivery" stop.
  const atDelivery = ga.daysToEdd <= 0;
  segments.push({
    key: 'delivery',
    state: atDelivery ? 'current' : 'upcoming',
    fill: atDelivery ? 1 : 0,
  });
  return segments;
}

// ------------------------------------------------------------------ milestone path

export type PathState =
  'done' | 'booked' | 'current' | 'upcoming' | 'overdue' | 'missed' | 'skipped';

export interface PathNode {
  key: string;
  kind: 'visit' | 'milestone' | 'now';
  state: PathState;
  title: string;
  description: string | null;
  weekFrom: number | null;
  weekTo: number | null;
  dueFrom: ISODate | null;
  dueTo: ISODate | null;
  tests: string[];
  visitId: string | null;
  appointmentId: string | null;
  category: string | null;
  /** Week used for ordering (visit: target week, milestone: first week). */
  sortWeek: number;
}

function visitState(v: Visit, today: ISODate): PathState {
  switch (v.status) {
    case 'completed':
      return 'done';
    case 'scheduled':
      return 'booked';
    case 'missed':
      return 'missed';
    case 'skipped':
    case 'cancelled':
      return 'skipped';
    case 'planned':
      if (v.due_to && v.due_to < today) return 'overdue';
      if (v.due_from && v.due_from <= today) return 'current';
      return 'upcoming';
  }
}

function milestoneState(m: Milestone, ga: GestationalAge): PathState {
  if (ga.weeks > m.week_to) return 'done';
  if (ga.weeks >= m.week_from) return 'current';
  return 'upcoming';
}

const PAST_STATES: readonly PathState[] = ['done', 'skipped', 'missed', 'overdue'];

export interface PathInput {
  visits: Visit[];
  milestones: Milestone[];
  ga: GestationalAge;
  today: ISODate;
  /** Anti-D only applies to Rh-negative patients. */
  rhNegative: boolean | null;
}

/**
 * Vertical milestone path: what is behind her (done / missed / overdue), a single "you are
 * here" node, then what is ahead (this week's window, booked and upcoming items).
 */
export function buildMilestonePath({
  visits,
  milestones,
  ga,
  today,
  rhNegative,
}: PathInput): PathNode[] {
  const nodes: PathNode[] = [];

  for (const v of visits) {
    nodes.push({
      key: `visit:${v.id}`,
      kind: 'visit',
      state: visitState(v, today),
      title: v.title,
      description: v.purpose ?? v.reason_added,
      weekFrom: v.target_week,
      weekTo: v.target_week,
      dueFrom: v.due_from,
      dueTo: v.due_to,
      tests: v.recommended_tests,
      visitId: v.id,
      appointmentId: v.appointment_id,
      category: null,
      sortWeek: v.target_week,
    });
  }

  for (const m of milestones) {
    if (m.key === 'anti_d' && rhNegative !== true) continue;
    nodes.push({
      key: `milestone:${m.key}`,
      kind: 'milestone',
      state: milestoneState(m, ga),
      title: m.title,
      description: m.description,
      weekFrom: m.week_from,
      weekTo: m.week_to,
      dueFrom: null,
      dueTo: null,
      tests: [],
      visitId: null,
      appointmentId: null,
      category: m.category,
      sortWeek: m.week_from,
    });
  }

  // Milestones sort before visits that share a week; visits keep their plan order.
  const order = (n: PathNode) => (n.kind === 'milestone' ? 0 : 1);
  const bySortWeek = (a: PathNode, b: PathNode) =>
    a.sortWeek - b.sortWeek || order(a) - order(b) || a.key.localeCompare(b.key);

  const past = nodes.filter((n) => PAST_STATES.includes(n.state)).sort(bySortWeek);
  const ahead = nodes.filter((n) => !PAST_STATES.includes(n.state)).sort(bySortWeek);

  const now: PathNode = {
    key: 'now',
    kind: 'now',
    state: 'current',
    title: '',
    description: null,
    weekFrom: ga.weeks,
    weekTo: ga.weeks,
    dueFrom: null,
    dueTo: null,
    tests: [],
    visitId: null,
    appointmentId: null,
    category: null,
    sortWeek: ga.weeks,
  };
  return [...past, now, ...ahead];
}

/** The next stages after "you are here": visits and scans/tests, not the trimester markers. */
export function whatsNext(path: PathNode[], limit = 3): PathNode[] {
  const nowIndex = path.findIndex((n) => n.kind === 'now');
  return path
    .slice(nowIndex + 1)
    .filter((n) => n.category !== 'trimester')
    .slice(0, limit);
}
