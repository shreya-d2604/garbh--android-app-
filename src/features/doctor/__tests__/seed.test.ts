// The demo AI draft in supabase/seeds/doctor.sql must be readable by the review screen.
import { aiSummaryDocumentSchema } from '@/domain/schemas/ai-summary';

import { documentFromRow } from '../ai-review';

const { readFileSync } = jest.requireActual<{
  readFileSync: (file: string, enc: 'utf8') => string;
}>('fs');

describe('doctor demo seed', () => {
  it('has an AI draft that matches the summary schema', () => {
    const sql = readFileSync(`${process.cwd()}/supabase/seeds/doctor.sql`, 'utf8');
    const match = /'(\{"lab_values".*?\}\})',\s*\n\s*now\(\)/s.exec(sql);
    expect(match).not.toBeNull();
    const draft: unknown = JSON.parse((match as RegExpExecArray)[1] as string);
    expect(aiSummaryDocumentSchema.safeParse(draft).success).toBe(true);
    expect(
      documentFromRow({ draft: draft as never, final: null })?.summary.doctor_attention_flags,
    ).toHaveLength(1);
  });
});
