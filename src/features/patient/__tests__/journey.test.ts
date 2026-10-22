import { gestationalAge } from '@/domain/pregnancy-math';

import {
  buildMilestonePath,
  journeySnapshot,
  pickWeekContent,
  trimesterTimeline,
  whatsNext,
} from '../journey';
import { milestone, visit, weekContent } from '../test-fixtures';

// EDD 2026-12-01 -> day 0 is 2026-02-24. On 2026-07-23 she is 21w2d? Use explicit helper instead.
const EDD = '2026-12-01';

describe('journeySnapshot', () => {
  it('computes weeks, trimester, progress and days to go', () => {
    // LMP = EDD - 280 = 2026-02-24. 2026-07-23 is day 149 = 21w2d.
    const s = journeySnapshot(EDD, '2026-07-23');
    expect(s.ga.weeks).toBe(21);
    expect(s.ga.days).toBe(2);
    expect(s.ga.trimester).toBe(2);
    expect(s.daysToGo).toBe(131);
    expect(s.progress).toBeCloseTo(149 / 280, 5);
    expect(s.postTerm).toBe(false);
  });

  it('clamps a date before day 0 to 0w0d', () => {
    const s = journeySnapshot(EDD, '2026-01-01');
    expect(s.ga.weeks).toBe(0);
    expect(s.ga.days).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.daysToGo).toBe(334);
  });

  it('flags post-term at 41 weeks', () => {
    const s = journeySnapshot(EDD, '2026-12-10'); // 289 days = 41w2d
    expect(s.postTerm).toBe(true);
    expect(s.daysToGo).toBe(-9);
    expect(s.progress).toBe(1);
  });
});

describe('pickWeekContent', () => {
  const rows = [weekContent({ week: 12 }), weekContent({ week: 20 }), weekContent({ week: 28 })];
  it('uses the latest week at or before the current one', () => {
    expect(pickWeekContent(rows, 24)?.week).toBe(20);
    expect(pickWeekContent(rows, 28)?.week).toBe(28);
    expect(pickWeekContent(rows, 41)?.week).toBe(28);
  });
  it('falls back to the first row before the earliest week, and null when empty', () => {
    expect(pickWeekContent(rows, 5)?.week).toBe(12);
    expect(pickWeekContent([], 5)).toBeNull();
  });
});

describe('trimesterTimeline', () => {
  it('marks the current trimester and fills it partially', () => {
    const t = trimesterTimeline(gestationalAge(EDD, '2026-07-23')); // 21w2d
    expect(t.map((s) => s.state)).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    const t2 = t[1];
    expect(t2?.fill).toBeCloseTo((149 - 98) / 98, 5);
  });

  it('puts her at Delivery on the due date', () => {
    const t = trimesterTimeline(gestationalAge(EDD, EDD));
    expect(t.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current']);
  });

  it('starts in the first trimester', () => {
    const t = trimesterTimeline(gestationalAge(EDD, '2026-03-10'));
    expect(t.map((s) => s.state)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
  });
});

describe('buildMilestonePath', () => {
  const today = '2026-07-23'; // 21w2d
  const ga = gestationalAge(EDD, today);
  const visits = [
    visit({
      id: 'v3',
      seq: 3,
      target_week: 16,
      status: 'completed',
      due_from: '2026-06-09',
      due_to: '2026-06-22',
      title: 'Visit 3',
    }),
    visit({
      id: 'v4',
      seq: 4,
      target_week: 20,
      status: 'completed',
      due_from: '2026-07-07',
      due_to: '2026-07-20',
      title: 'Visit 4',
    }),
    visit({
      id: 'v5',
      seq: 5,
      target_week: 24,
      status: 'scheduled',
      appointment_id: 'a1',
      due_from: '2026-08-04',
      due_to: '2026-08-17',
      title: 'Visit 5',
    }),
    visit({
      id: 'v6',
      seq: 6,
      target_week: 28,
      status: 'planned',
      due_from: '2026-09-01',
      due_to: '2026-09-14',
      title: 'Visit 6',
    }),
  ];
  const milestones = [
    milestone({ key: 'nt_scan', title: 'NT scan', week_from: 11, week_to: 13, category: 'scan' }),
    milestone({
      key: 'anomaly_scan',
      title: 'Anomaly scan',
      week_from: 18,
      week_to: 22,
      category: 'scan',
    }),
    milestone({ key: 'ogtt', title: 'OGTT', week_from: 24, week_to: 28, category: 'test' }),
    milestone({ key: 'anti_d', title: 'Anti-D', week_from: 28, week_to: 28, category: 'vaccine' }),
    milestone({
      key: 'trimester_3',
      title: 'Third trimester begins',
      week_from: 28,
      week_to: 28,
      category: 'trimester',
    }),
  ];

  it('puts past items first, one "you are here" node, then what is ahead', () => {
    const path = buildMilestonePath({ visits, milestones, ga, today, rhNegative: false });
    const keys = path.map((n) => n.key);
    expect(keys).toEqual([
      'milestone:nt_scan',
      'visit:v3',
      'visit:v4',
      'now',
      'milestone:anomaly_scan', // window 18-22 is open now
      'milestone:ogtt',
      'visit:v5',
      'milestone:trimester_3',
      'visit:v6',
    ]);
    expect(path.filter((n) => n.kind === 'now')).toHaveLength(1);
  });

  it('maps visit and milestone states', () => {
    const path = buildMilestonePath({ visits, milestones, ga, today, rhNegative: false });
    const state = (k: string) => path.find((n) => n.key === k)?.state;
    expect(state('visit:v4')).toBe('done');
    expect(state('visit:v5')).toBe('booked');
    expect(state('visit:v6')).toBe('upcoming');
    expect(state('milestone:nt_scan')).toBe('done');
    expect(state('milestone:anomaly_scan')).toBe('current');
    expect(state('milestone:ogtt')).toBe('upcoming');
  });

  it('only shows anti-D for Rh-negative patients', () => {
    const neg = buildMilestonePath({ visits, milestones, ga, today, rhNegative: true });
    const pos = buildMilestonePath({ visits, milestones, ga, today, rhNegative: false });
    const unknown = buildMilestonePath({ visits, milestones, ga, today, rhNegative: null });
    expect(neg.some((n) => n.key === 'milestone:anti_d')).toBe(true);
    expect(pos.some((n) => n.key === 'milestone:anti_d')).toBe(false);
    expect(unknown.some((n) => n.key === 'milestone:anti_d')).toBe(false);
  });

  it('flags a planned visit whose window has closed as overdue, before the marker', () => {
    const late = [
      visit({
        id: 'v9',
        seq: 4,
        target_week: 20,
        status: 'planned',
        due_from: '2026-07-07',
        due_to: '2026-07-20',
      }),
    ];
    const path = buildMilestonePath({ visits: late, milestones: [], ga, today, rhNegative: null });
    expect(path.map((n) => `${n.key}:${n.state}`)).toEqual(['visit:v9:overdue', 'now:current']);
  });

  it('marks an open planned window as current and keeps missed visits behind her', () => {
    const v = [
      visit({
        id: 'a',
        seq: 4,
        target_week: 20,
        status: 'planned',
        due_from: '2026-07-07',
        due_to: '2026-07-31',
      }),
      visit({ id: 'b', seq: 3, target_week: 16, status: 'missed' }),
    ];
    const path = buildMilestonePath({ visits: v, milestones: [], ga, today, rhNegative: null });
    expect(path.map((n) => `${n.key}:${n.state}`)).toEqual([
      'visit:b:missed',
      'now:current',
      'visit:a:current',
    ]);
  });
});

describe('whatsNext', () => {
  it('returns the next stages after the marker, skipping trimester markers', () => {
    const ga = gestationalAge(EDD, '2026-07-23');
    const path = buildMilestonePath({
      visits: [
        visit({
          id: 'v6',
          seq: 6,
          target_week: 28,
          due_from: '2026-09-01',
          due_to: '2026-09-14',
          title: 'Visit 6',
        }),
      ],
      milestones: [
        milestone({ key: 'ogtt', week_from: 24, week_to: 28 }),
        milestone({ key: 'trimester_3', week_from: 28, week_to: 28, category: 'trimester' }),
        milestone({
          key: 'growth_scan',
          title: 'Growth scan',
          week_from: 32,
          week_to: 36,
          category: 'scan',
        }),
        milestone({
          key: 'birth_plan',
          title: 'Birth plan',
          week_from: 34,
          week_to: 36,
          category: 'education',
        }),
      ],
      ga,
      today: '2026-07-23',
      rhNegative: false,
    });
    expect(whatsNext(path, 3).map((n) => n.key)).toEqual([
      'milestone:ogtt',
      'visit:v6',
      'milestone:growth_scan',
    ]);
    expect(whatsNext(path, 2)).toHaveLength(2);
  });
});
