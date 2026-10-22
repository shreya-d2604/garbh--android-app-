import type { AiSummaryDocument } from '@/domain/schemas/ai-summary';

import {
  countLowConfidence,
  documentFromRow,
  documentIssues,
  filterInbox,
  inboxCounts,
  inboxTabFor,
  parseFunctionError,
  functionErrorKey,
  isLowConfidence,
  labDisplayValue,
  normalizeDocument,
  regenerateRequest,
  removeAt,
  replaceAt,
} from '../ai-review';

const doc = (over: Partial<AiSummaryDocument['summary']> = {}): AiSummaryDocument => ({
  summary: {
    headline: 'Your haemoglobin is slightly low.',
    plain_language_summary: 'Mild anaemia.',
    key_findings: [{ finding: 'Hb 10.2', status: 'attention', explanation: 'A bit low.' }],
    foods_to_eat: [{ item: 'Spinach', why: 'Iron' }],
    foods_to_avoid: [],
    medicines_to_avoid: [],
    lifestyle_tips: ['Rest'],
    questions_for_doctor: [],
    doctor_attention_flags: ['Hb 10.2 at 28w: consider IV iron?'],
    ...over,
  },
});

describe('AI review helpers', () => {
  it('highlights extracted values below 0.8 confidence', () => {
    expect(isLowConfidence(0.79)).toBe(true);
    expect(isLowConfidence(0.8)).toBe(false);
    expect(isLowConfidence(null)).toBe(false);
    expect(
      countLowConfidence([
        { confidence: 0.5, verified: false },
        { confidence: 0.9, verified: false },
        { confidence: 0.4, verified: true },
      ]),
    ).toBe(1);
  });

  it('prefers the doctor edits (final) over the AI draft and rejects unreadable JSON', () => {
    const draft = doc();
    const final = doc({ headline: 'Edited' });
    expect(documentFromRow({ draft, final })?.summary.headline).toBe('Edited');
    expect(documentFromRow({ draft, final: null })?.summary.headline).toBe('Your haemoglobin is slightly low.');
    expect(documentFromRow({ draft: { nope: true }, final: null })).toBeNull();
    expect(documentFromRow({ draft: null, final: null })).toBeNull();
  });

  it('requires a headline and a summary before publishing', () => {
    expect(documentIssues(doc())).toEqual([]);
    expect(documentIssues(doc({ headline: ' ' }))).toEqual(['ai.issues.headline']);
    expect(documentIssues(doc({ headline: '', plain_language_summary: '' }))).toEqual(['ai.issues.headline', 'ai.issues.summary']);
  });

  it('trims text and drops empty list entries, keeping the doctor-only flags', () => {
    const cleaned = normalizeDocument(
      doc({
        headline: '  Hi ',
        lifestyle_tips: [' Rest ', ' ', ''],
        foods_to_eat: [{ item: ' ', why: 'x' }, { item: ' Dates ', why: ' Iron ' }],
        key_findings: [{ finding: ' ', status: 'normal', explanation: '' }],
      }),
    );
    expect(cleaned.summary.headline).toBe('Hi');
    expect(cleaned.summary.lifestyle_tips).toEqual(['Rest']);
    expect(cleaned.summary.foods_to_eat).toEqual([{ item: 'Dates', why: 'Iron' }]);
    expect(cleaned.summary.key_findings).toEqual([]);
    expect(cleaned.summary.doctor_attention_flags).toHaveLength(1);
  });

  it('edits lists immutably', () => {
    const list = ['a', 'b', 'c'];
    expect(replaceAt(list, 1, 'x')).toEqual(['a', 'x', 'c']);
    expect(removeAt(list, 0)).toEqual(['b', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('picks the Edge Function that regenerates each kind of summary', () => {
    expect(regenerateRequest({ source_type: 'report', source_id: 'r1', pregnancy_id: 'p1' })).toEqual({
      name: 'process-report',
      body: { report_id: 'r1' },
    });
    expect(regenerateRequest({ source_type: 'consultation', source_id: 'c1', pregnancy_id: 'p1' })).toEqual({
      name: 'summarize-consultation',
      body: { consultation_id: 'c1' },
    });
    expect(regenerateRequest({ source_type: 'cumulative', source_id: null, pregnancy_id: 'p1' })).toEqual({
      name: 'summarize-pregnancy',
      body: { pregnancy_id: 'p1' },
    });
    expect(regenerateRequest({ source_type: 'report', source_id: null, pregnancy_id: 'p1' })).toBeNull();
  });

  it('maps Edge Function errors to messages', () => {
    expect(functionErrorKey('RATE_LIMITED')).toBe('ai.errors.RATE_LIMITED');
    expect(functionErrorKey('AI_FAILED')).toBe('ai.errors.AI_FAILED');
    expect(functionErrorKey('NOT_IMPLEMENTED')).toBe('ai.errors.NOT_IMPLEMENTED');
    expect(functionErrorKey('whatever')).toBe('ai.errors.GENERIC');
    expect(functionErrorKey(null)).toBe('ai.errors.GENERIC');
  });

  it('shows a numeric value, else the text value', () => {
    expect(labDisplayValue({ value_num: 10.2, value_text: null })).toBe('10.2');
    expect(labDisplayValue({ value_num: null, value_text: 'Negative' })).toBe('Negative');
    expect(labDisplayValue({ value_num: null, value_text: null })).toBe('');
  });
});

describe('inbox sections', () => {
  const rows = [
    { status: 'draft' as const, created_at: '2026-09-01T00:00:00Z' },
    { status: 'draft' as const, created_at: '2026-09-02T00:00:00Z' },
    { status: 'published' as const, created_at: '2026-08-01T00:00:00Z' },
    { status: 'rejected' as const, created_at: '2026-08-02T00:00:00Z' },
    { status: 'failed' as const, created_at: '2026-09-03T00:00:00Z' },
    { status: 'generating' as const, created_at: '2026-09-04T00:00:00Z' },
  ];

  it('puts drafts under "to review", newest first', () => {
    expect(filterInbox(rows, 'review').map((r) => r.created_at)).toEqual(['2026-09-02T00:00:00Z', '2026-09-01T00:00:00Z']);
  });

  it('groups finished and problem summaries', () => {
    expect(filterInbox(rows, 'done')).toHaveLength(2);
    expect(filterInbox(rows, 'issues').map((r) => r.status)).toEqual(['generating', 'failed']);
    expect(inboxCounts(rows)).toEqual({ review: 2, done: 2, issues: 2 });
    expect(inboxTabFor('approved')).toBe('done');
  });
});

describe('function errors', () => {
  it('uses the function error code, or NOT_IMPLEMENTED for a missing function', () => {
    expect(parseFunctionError(403, { error: 'NOT_ON_CARE_TEAM' })).toBe('NOT_ON_CARE_TEAM');
    expect(parseFunctionError(404, { code: 'NOT_FOUND', message: 'Requested function was not found' })).toBe('NOT_IMPLEMENTED');
    expect(parseFunctionError(404, null)).toBe('NOT_IMPLEMENTED');
    expect(parseFunctionError(502, { error: 'AI_FAILED' })).toBe('AI_FAILED');
    expect(parseFunctionError(500, 'oops')).toBe('GENERIC');
    expect(parseFunctionError(null, undefined)).toBe('GENERIC');
  });
});
