// Patient-facing view of a published AI summary (PLAN.md §9.3). `final` is doctor-edited JSON,
// so it is parsed leniently: a missing list becomes empty instead of breaking the screen.
// `doctor_attention_flags` is doctor-only and is never read here.
import { z } from 'zod';

const itemWhy = z.object({ item: z.string(), why: z.string().default('') });

const lenientSchema = z.object({
  summary: z.object({
    headline: z.string().default(''),
    plain_language_summary: z.string().default(''),
    key_findings: z
      .array(
        z.object({
          finding: z.string(),
          status: z.enum(['normal', 'attention', 'urgent']).catch('normal'),
          explanation: z.string().default(''),
        }),
      )
      .default([]),
    foods_to_eat: z.array(itemWhy).default([]),
    foods_to_avoid: z.array(itemWhy).default([]),
    medicines_to_avoid: z.array(itemWhy).default([]),
    lifestyle_tips: z.array(z.string()).default([]),
    questions_for_doctor: z.array(z.string()).default([]),
  }),
});

export type PatientSummary = z.infer<typeof lenientSchema>['summary'];

/** Returns null when the JSON is not a summary document or has nothing to show. */
export function parseSummary(final: unknown): PatientSummary | null {
  const parsed = lenientSchema.safeParse(final);
  if (!parsed.success) return null;
  const s = parsed.data.summary;
  const hasContent = s.headline || s.plain_language_summary || s.key_findings.length > 0;
  return hasContent ? s : null;
}

/** Headline plus up to `max` short points: findings first, then lifestyle tips. */
export function keyPoints(summary: PatientSummary, max = 3): string[] {
  const findings = summary.key_findings.map((f) => f.finding).filter(Boolean);
  const tips = summary.lifestyle_tips.filter(Boolean);
  return [...findings, ...tips].slice(0, max);
}
