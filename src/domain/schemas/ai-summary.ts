// AI output schema (PLAN.md §9.3). App-side copy; the backend agent keeps the Deno copy in
// supabase/functions/_shared/schemas.ts. Both must match §9.3 exactly.
import { z } from 'zod';

const itemWhy = z.object({ item: z.string(), why: z.string() });

export const aiSummarySchema = z.object({
  headline: z.string(),
  plain_language_summary: z.string(),
  key_findings: z.array(
    z.object({
      finding: z.string(),
      status: z.enum(['normal', 'attention', 'urgent']),
      explanation: z.string(),
    }),
  ),
  foods_to_eat: z.array(itemWhy),
  foods_to_avoid: z.array(itemWhy),
  medicines_to_avoid: z.array(itemWhy),
  lifestyle_tips: z.array(z.string()),
  questions_for_doctor: z.array(z.string()),
  /** Doctor-only. Stripped from `final` before publishing; never shown to patients/companions. */
  doctor_attention_flags: z.array(z.string()).optional(),
  confidence_note: z.string().optional(),
});
export type AiSummary = z.infer<typeof aiSummarySchema>;

export const aiLabValueSchema = z.object({
  raw_name: z.string(),
  test_code: z.string().nullable(),
  value: z.number().nullable(),
  value_text: z.string().nullable(),
  unit: z.string().nullable(),
  ref_range_on_report: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type AiLabValue = z.infer<typeof aiLabValueSchema>;

/** Shape of ai_summaries.draft / ai_summaries.final (and published_summaries.final). */
export const aiSummaryDocumentSchema = z.object({
  lab_values: z.array(aiLabValueSchema).optional(),
  summary: aiSummarySchema,
});
export type AiSummaryDocument = z.infer<typeof aiSummaryDocumentSchema>;

/** Patient-facing view of a summary document (what publishing must produce). */
export function toPatientFacing(doc: AiSummaryDocument): AiSummaryDocument {
  const { doctor_attention_flags: _flags, ...summary } = doc.summary;
  return { ...doc, summary };
}
