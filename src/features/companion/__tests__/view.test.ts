import {
  contentWeek,
  findingTone,
  groupBy,
  labFlagTone,
  labValueText,
  splitAppointments,
  splitPrescriptions,
  summaryPreview,
  visitTone,
} from '../view';

describe('splitAppointments', () => {
  const now = new Date('2026-10-23T10:00:00Z');
  const appt = (
    id: string,
    starts: string,
    ends: string,
    status: 'booked' | 'completed' | 'cancelled' | 'checked_in',
  ) => ({
    id,
    starts_at: starts,
    ends_at: ends,
    status,
  });

  it('puts active future (or in-progress) visits first, soonest first', () => {
    const { upcoming, past } = splitAppointments(
      [
        appt('later', '2026-10-30T09:00:00Z', '2026-10-30T09:15:00Z', 'booked'),
        appt('soon', '2026-10-24T09:00:00Z', '2026-10-24T09:15:00Z', 'booked'),
        appt('now', '2026-10-23T09:50:00Z', '2026-10-23T10:05:00Z', 'checked_in'),
        appt('done', '2026-10-01T09:00:00Z', '2026-10-01T09:15:00Z', 'completed'),
        appt('older', '2026-09-01T09:00:00Z', '2026-09-01T09:15:00Z', 'completed'),
      ],
      now,
    );
    expect(upcoming.map((a) => a.id)).toEqual(['now', 'soon', 'later']);
    expect(past.map((a) => a.id)).toEqual(['done', 'older']);
  });

  it('treats cancelled future appointments and unclosed old ones as past', () => {
    const { upcoming, past } = splitAppointments(
      [
        appt('cancelled', '2026-10-30T09:00:00Z', '2026-10-30T09:15:00Z', 'cancelled'),
        appt('stale', '2026-10-01T09:00:00Z', '2026-10-01T09:15:00Z', 'booked'),
      ],
      now,
    );
    expect(upcoming).toEqual([]);
    expect(past.map((a) => a.id)).toEqual(['cancelled', 'stale']);
  });
});

describe('splitPrescriptions', () => {
  it('current = not stopped and not past the end date (open-ended counts)', () => {
    const items = [
      { id: 'a', is_active: true, end_date: '2026-10-30' },
      { id: 'b', is_active: true, end_date: '2026-10-23' },
      { id: 'c', is_active: true, end_date: '2026-10-01' },
      { id: 'd', is_active: false, end_date: '2026-12-01' },
      { id: 'e', is_active: true, end_date: null },
    ];
    const { current, past } = splitPrescriptions(items, '2026-10-23');
    expect(current.map((i) => i.id)).toEqual(['a', 'b', 'e']);
    expect(past.map((i) => i.id)).toEqual(['c', 'd']);
  });
});

describe('summaryPreview', () => {
  const doc = {
    summary: {
      headline: 'All looks well',
      plain_language_summary: 'Your blood count is normal.',
      key_findings: [{ finding: 'Hb', status: 'normal', explanation: 'In range' }],
      foods_to_eat: [],
      foods_to_avoid: [],
      medicines_to_avoid: [],
      lifestyle_tips: ['Walk daily'],
      questions_for_doctor: [],
    },
  };

  it('parses a valid published document', () => {
    const p = summaryPreview(doc);
    expect(p?.headline).toBe('All looks well');
    expect(p?.findings).toHaveLength(1);
    expect(p?.lifestyleTips).toEqual(['Walk daily']);
  });

  it('still shows the headline of a partial document', () => {
    expect(summaryPreview({ summary: { headline: 'ok' } })).toEqual({
      headline: 'ok',
      text: null,
      findings: [],
      lifestyleTips: [],
      questionsForDoctor: [],
    });
  });

  it('is null when there is nothing to show', () => {
    expect(summaryPreview(null)).toBeNull();
    expect(summaryPreview({})).toBeNull();
    expect(summaryPreview({ summary: { headline: '' } })).toBeNull();
  });
});

describe('small helpers', () => {
  it('maps statuses to tones', () => {
    expect(findingTone('normal')).toBe('success');
    expect(findingTone('attention')).toBe('warning');
    expect(findingTone('urgent')).toBe('danger');
    expect(labFlagTone('high')).toBe('warning');
    expect(labFlagTone('abnormal')).toBe('danger');
    expect(labFlagTone(null)).toBe('neutral');
    expect(visitTone('completed')).toBe('success');
    expect(visitTone('missed')).toBe('danger');
    expect(visitTone('planned')).toBe('neutral');
  });

  it('formats lab values', () => {
    expect(labValueText({ value_num: 11.5, value_text: null, unit: 'g/dL' })).toBe('11.5 g/dL');
    expect(labValueText({ value_num: 7, value_text: null, unit: null })).toBe('7');
    expect(labValueText({ value_num: null, value_text: 'Positive', unit: null })).toBe('Positive');
    expect(labValueText({ value_num: null, value_text: null, unit: null })).toBeNull();
  });

  it('clamps the week to the content table range', () => {
    expect(contentWeek(1)).toBe(4);
    expect(contentWeek(24)).toBe(24);
    expect(contentWeek(44)).toBe(42);
  });

  it('groups rows by key', () => {
    expect(
      groupBy(
        [
          { k: 'a', v: 1 },
          { k: 'b', v: 2 },
          { k: 'a', v: 3 },
        ],
        (r) => r.k,
      ),
    ).toEqual({
      a: [
        { k: 'a', v: 1 },
        { k: 'a', v: 3 },
      ],
      b: [{ k: 'b', v: 2 }],
    });
  });
});
