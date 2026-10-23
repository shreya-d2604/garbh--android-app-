// AI output schema (PLAN.md §9.3). Deno copy of src/domain/schemas/ai-summary.ts: the two MUST
// stay identical (a drift test in gemini.test.ts and the SQL validator in migration
// 20261029000300 enforce the same shape).
import { z } from './deps.ts';

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
  /** Doctor-only. Stripped from `final` before publishing. */
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

/** ai_summaries.draft / final: `{ lab_values?, summary }`. */
export const aiSummaryDocumentSchema = z.object({
  lab_values: z.array(aiLabValueSchema).optional(),
  summary: aiSummarySchema,
});
export type AiSummaryDocument = z.infer<typeof aiSummaryDocumentSchema>;

/** What the model must return for a report: values are required (may be empty). */
export const extractionOutputSchema = z.object({
  lab_values: z.array(aiLabValueSchema),
  summary: aiSummarySchema,
});
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

/** What the model must return for consultation / pregnancy summaries. */
export const summaryOutputSchema = z.object({ summary: aiSummarySchema });
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

export const uuidSchema = z.uuid();

/** Patient-facing view of a document: doctor-only flags removed. */
export function stripDoctorFlags<T extends { summary: AiSummary }>(doc: T): T {
  const { doctor_attention_flags: _flags, ...summary } = doc.summary;
  return { ...doc, summary };
}
