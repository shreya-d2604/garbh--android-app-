// summarize-pregnancy: cumulative summary from verified data -> DRAFT.
import { buildContext } from '../_shared/context.ts';
import { fail, generateDraft, gate, internalError, json, sha256Hex, type Runtime } from '../_shared/pipeline.ts';
import { summaryOutputSchema, uuidSchema } from '../_shared/schemas.ts';

export async function handleSummarizePregnancy(req: Request, rt: Runtime): Promise<Response> {
  const g = await gate(req, rt);
  if (!g.ok) return g.response;

  const id = uuidSchema.safeParse(g.body.pregnancy_id);
  if (!id.success) return fail('INVALID_INPUT');

  let summaryId: string | null = null;
  try {
    if (!(await rt.repo.pregnancyExists(id.data))) return fail('NOT_FOUND');
    if (!(await g.caller.onCareTeam(id.data))) return fail('NOT_ON_CARE_TEAM');
    if ((await g.caller.consumeQuota('summarize-pregnancy')) === 'rate_limited') return fail('RATE_LIMITED');

    const context = buildContext(await rt.repo.contextSource(id.data));
    const result = await generateDraft(rt, {
      pregnancyId: id.data,
      sourceType: 'cumulative',
      sourceId: null,
      schema: summaryOutputSchema,
      call: () => rt.provider.summarizePregnancy({ context }),
    });
    if (!result.ok) return fail('AI_FAILED');
    summaryId = result.summaryId;

    const inputHash = await sha256Hex(JSON.stringify({ context, v: rt.provider.promptVersion }));
    await rt.repo.completeSummary(result.summaryId, { summary: result.output.summary }, { input_hash: inputHash, token_usage: result.usage });
    return json(200, { summary_id: result.summaryId });
  } catch {
    try {
      if (summaryId) await rt.repo.failSummary(summaryId, 'internal error');
    } catch {
      /* nothing more to do */
    }
    return internalError();
  }
}
