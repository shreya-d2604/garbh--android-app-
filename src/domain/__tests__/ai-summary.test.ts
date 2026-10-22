import { aiSummaryDocumentSchema, toPatientFacing } from '../schemas/ai-summary';

const doc = {
  summary: {
    headline: 'Your haemoglobin is slightly low.',
    plain_language_summary: 'Mild anaemia.',
    key_findings: [{ finding: 'Hb 10.2', status: 'attention', explanation: 'Slightly low' }],
    foods_to_eat: [{ item: 'Spinach', why: 'Iron' }],
    foods_to_avoid: [],
    medicines_to_avoid: [],
    lifestyle_tips: [],
    questions_for_doctor: [],
    doctor_attention_flags: ['Consider IV iron'],
  },
};

describe('ai summary schema', () => {
  it('parses the PLAN §9.3 shape', () => {
    expect(aiSummaryDocumentSchema.safeParse(doc).success).toBe(true);
    expect(aiSummaryDocumentSchema.safeParse({ summary: { headline: 'x' } }).success).toBe(false);
  });

  it('strips doctor-only flags for patients', () => {
    const parsed = aiSummaryDocumentSchema.parse(doc);
    expect(toPatientFacing(parsed).summary).not.toHaveProperty('doctor_attention_flags');
  });
});
