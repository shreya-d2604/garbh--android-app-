// summarize-consultation: a published (or draft) consultation -> patient-friendly summary DRAFT.
import { buildContext } from '../_shared/context.ts';
import { fail, generateDraft, gate, internalError, json, sha256Hex, type Runtime } from '../_shared/pipeline.ts';
import { summaryOutputSchema, uuidSchema } from '../_shared/schemas.ts';

export async function handleSummarizeConsultation(req: Request, rt: Runtime): Promise<Response> {
  const g = await gate(req, rt);
  if (!g.ok) return g.response;

  const id = uuidSchema.safeParse(g.body.consultation_id);
  if (!id.success) return fail('INVALID_INPUT');

  let summaryId: string | null = null;
  try {
    const consultation = await rt.repo.getConsultation(id.data);
    if (!consultation) return fail('NOT_FOUND');
    if (!(await g.caller.onCareTeam(consultation.pregnancy_id))) return fail('NOT_ON_CARE_TEAM');
    if ((await g.caller.consumeQuota('summarize-consultation')) === 'rate_limited') return fail('RATE_LIMITED');

    const context = buildContext(await rt.repo.contextSource(consultation.pregnancy_id), consultation);
    const result = await generateDraft(rt, {
      pregnancyId: consultation.pregnancy_id,
      sourceType: 'consultation',
      sourceId: consultation.id,
      schema: summaryOutputSchema,
      call: () => rt.provider.summarizeConsultation({ context }),
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
