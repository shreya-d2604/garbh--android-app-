import { keyPoints, parseSummary } from '../summary';

const full = {
  summary: {
    headline: 'Your haemoglobin is slightly low.',
    plain_language_summary: 'Mild anaemia.',
    key_findings: [
      { finding: 'Hb 10.4 g/dL', status: 'attention', explanation: 'A little below range.' },
      { finding: 'TSH normal', status: 'normal', explanation: '' },
    ],
    foods_to_eat: [{ item: 'Spinach', why: 'Iron' }],
    foods_to_avoid: [],
    medicines_to_avoid: [],
    lifestyle_tips: ['Take iron after food', 'Walk daily'],
    questions_for_doctor: [],
    doctor_attention_flags: ['Hb 10.4 at 20w'],
  },
};

describe('parseSummary', () => {
  it('parses a published document and never exposes doctor-only flags', () => {
    const s = parseSummary(full);
    expect(s?.headline).toBe('Your haemoglobin is slightly low.');
    expect(s?.key_findings).toHaveLength(2);
    expect(s).not.toHaveProperty('doctor_attention_flags');
  });

  it('is lenient: missing lists become empty and a bad status becomes normal', () => {
    const s = parseSummary({
      summary: { headline: 'Hi', key_findings: [{ finding: 'x', status: 'weird' }] },
    });
    expect(s?.foods_to_eat).toEqual([]);
    expect(s?.key_findings[0]?.status).toBe('normal');
  });

  it('returns null for junk or an empty summary', () => {
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary('text')).toBeNull();
    expect(parseSummary({ summary: {} })).toBeNull();
  });
});

describe('keyPoints', () => {
  it('uses findings first and tops up with lifestyle tips, max three', () => {
    const s = parseSummary(full);
    expect(s && keyPoints(s)).toEqual(['Hb 10.4 g/dL', 'TSH normal', 'Take iron after food']);
    expect(s && keyPoints(s, 2)).toEqual(['Hb 10.4 g/dL', 'TSH normal']);
  });
});
