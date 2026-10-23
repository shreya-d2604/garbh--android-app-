// The AI draft pipeline shared by the three functions. Rules (PLAN.md §8.2, §9.5):
//   * the caller is a care-team doctor (checked by the database), within the hourly quota
//   * the model only ever sees the de-identified context
//   * output is re-validated with zod; one retry on provider error or invalid output, then
//     the summary is stored as `failed` (the doctor can still enter values by hand)
//   * the result is a DRAFT. Nothing here can publish: that needs review_ai_summary.
import { AiProviderError, type AiProvider, type ProviderResult } from './gemini.ts';
import { fail, json, preflight, readJson } from './http.ts';
import type { Authenticate, Caller } from './auth.ts';
import type { AiRepo, SummarySourceType } from './repo.ts';
import type { z } from './deps.ts';

export interface Runtime {
  authenticate: Authenticate;
  repo: AiRepo;
  provider: AiProvider;
}

export type Gate =
  | { ok: true; caller: Caller; body: Record<string, unknown> }
  | { ok: false; response: Response };

/** CORS preflight, JSON body, JWT. Returns the caller or the response to send. */
export async function gate(req: Request, rt: Runtime): Promise<Gate | { ok: false; response: Response }> {
  const pre = preflight(req);
  if (pre) return { ok: false, response: pre };
  if (req.method !== 'POST') return { ok: false, response: fail('INVALID_INPUT') };
  const caller = await rt.authenticate(req);
  if (!caller) return { ok: false, response: fail('NOT_AUTHENTICATED') };
  const body = await readJson(req);
  if (!body) return { ok: false, response: fail('INVALID_INPUT') };
  return { ok: true, caller, body };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Short, data-free description of why validation failed (paths and issue codes only). */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || '(root)'}:${i.code}`)
    .join(', ')
    .slice(0, 300);
}

export type DraftResult<T> =
  | { ok: true; summaryId: string; output: T; usage: unknown }
  | { ok: false; summaryId: string; error: string };

/**
 * Creates the `generating` row, calls the provider (retry once), validates, and returns the
 * validated output. On final failure marks the row `failed` and reports it.
 */
export async function generateDraft<T>(
  rt: Runtime,
  job: {
    pregnancyId: string;
    sourceType: SummarySourceType;
    sourceId: string | null;
    call: () => Promise<ProviderResult>;
    schema: z.ZodType<T>;
  },
): Promise<DraftResult<T>> {
  await rt.repo.supersedeDrafts(job.pregnancyId, job.sourceType, job.sourceId);
  const summaryId = await rt.repo.createSummary({
    pregnancy_id: job.pregnancyId,
    source_type: job.sourceType,
    source_id: job.sourceId,
    model: rt.provider.model,
    prompt_version: rt.provider.promptVersion,
  });

  let lastError = 'AI_FAILED';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await job.call();
      const parsed = job.schema.safeParse(res.output);
      if (parsed.success) return { ok: true, summaryId, output: parsed.data, usage: res.usage ?? null };
      lastError = `invalid output: ${describeIssues(parsed.error)}`;
    } catch (e) {
      lastError = e instanceof AiProviderError ? e.message : 'provider error';
    }
  }
  await rt.repo.failSummary(summaryId, `${lastError} (after 2 attempts)`);
  return { ok: false, summaryId, error: lastError };
}

export function internalError(): Response {
  // Deliberately no detail: error text can quote data.
  return fail('INTERNAL');
}

export { fail, json };
