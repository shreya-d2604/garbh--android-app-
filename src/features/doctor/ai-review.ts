// AI review inbox (PLAN.md §7.4 #6, §9.3): editing helpers for the summary document. Pure.
import {
  aiSummaryDocumentSchema,
  type AiSummary,
  type AiSummaryDocument,
} from '@/domain/schemas/ai-summary';

import type { AiSummaryRow, LabResultRow, SummarySource } from './types';

/** Extracted values below this confidence are highlighted for the doctor. */
export const LOW_CONFIDENCE = 0.8;

export function isLowConfidence(confidence: number | null | undefined): boolean {
  return confidence != null && confidence < LOW_CONFIDENCE;
}

export function countLowConfidence(results: readonly Pick<LabResultRow, 'confidence' | 'verified'>[]): number {
  return results.filter((r) => !r.verified && isLowConfidence(r.confidence)).length;
}

/** The document the doctor edits: their saved edits if any, otherwise the AI draft. Null if unreadable. */
export function documentFromRow(
  row: Pick<AiSummaryRow, 'draft' | 'final'>,
): AiSummaryDocument | null {
  const parsed = aiSummaryDocumentSchema.safeParse(row.final ?? row.draft);
  return parsed.success ? parsed.data : null;
}

/** i18n keys (namespace doctor) of what is missing before the summary can be published. */
export function documentIssues(doc: AiSummaryDocument): string[] {
  const issues: string[] = [];
  if (doc.summary.headline.trim() === '') issues.push('ai.issues.headline');
  if (doc.summary.plain_language_summary.trim() === '') issues.push('ai.issues.summary');
  return issues;
}

const cleanPairs = <T extends { item: string; why: string }>(items: T[]) =>
  items.map((i) => ({ ...i, item: i.item.trim(), why: i.why.trim() })).filter((i) => i.item !== '');
const cleanStrings = (items: string[]) => items.map((s) => s.trim()).filter((s) => s !== '');

/** Trims text and drops empty list entries before saving. Doctor-only flags are kept; the server strips them on publish. */
export function normalizeDocument(doc: AiSummaryDocument): AiSummaryDocument {
  const s = doc.summary;
  const summary: AiSummary = {
    ...s,
    headline: s.headline.trim(),
    plain_language_summary: s.plain_language_summary.trim(),
    key_findings: s.key_findings
      .map((f) => ({ ...f, finding: f.finding.trim(), explanation: f.explanation.trim() }))
      .filter((f) => f.finding !== ''),
    foods_to_eat: cleanPairs(s.foods_to_eat),
    foods_to_avoid: cleanPairs(s.foods_to_avoid),
    medicines_to_avoid: cleanPairs(s.medicines_to_avoid),
    lifestyle_tips: cleanStrings(s.lifestyle_tips),
    questions_for_doctor: cleanStrings(s.questions_for_doctor),
  };
  return { ...doc, summary };
}

export function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((v, i) => (i === index ? value : v));
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export type SummaryFunction = 'process-report' | 'summarize-consultation' | 'summarize-pregnancy';

/** Edge Function that (re)generates a summary of this source type, with its request body. */
export function regenerateRequest(
  row: Pick<AiSummaryRow, 'source_type' | 'source_id' | 'pregnancy_id'>,
): { name: SummaryFunction; body: Record<string, string> } | null {
  const source: SummarySource = row.source_type;
  switch (source) {
    case 'report':
      return row.source_id ? { name: 'process-report', body: { report_id: row.source_id } } : null;
    case 'consultation':
      return row.source_id
        ? { name: 'summarize-consultation', body: { consultation_id: row.source_id } }
        : null;
    case 'cumulative':
      return { name: 'summarize-pregnancy', body: { pregnancy_id: row.pregnancy_id } };
  }
}

/** Edge Function error codes -> i18n key (namespace doctor). Unknown codes get the generic one. */
export function functionErrorKey(code: string | null | undefined): string {
  switch (code) {
    case 'RATE_LIMITED':
    case 'NOT_FOUND':
    case 'NOT_ON_CARE_TEAM':
    case 'AI_FAILED':
    case 'NOT_IMPLEMENTED':
      return `ai.errors.${code}`;
    default:
      return 'ai.errors.GENERIC';
  }
}

/** Value of an extracted lab value for display next to its unit. */
export function labDisplayValue(r: Pick<LabResultRow, 'value_num' | 'value_text'>): string {
  if (r.value_num != null) return String(r.value_num);
  return r.value_text ?? '';
}

