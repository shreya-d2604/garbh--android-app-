// process-report: report files -> unverified lab_results + AI summary DRAFT (PLAN.md §8.2).
import { buildContext } from '../_shared/context.ts';
import { toLabResults } from '../_shared/labs.ts';
import { fail, generateDraft, gate, internalError, json, sha256Hex, type Runtime } from '../_shared/pipeline.ts';
import { extractionOutputSchema, uuidSchema } from '../_shared/schemas.ts';

export async function handleProcessReport(req: Request, rt: Runtime): Promise<Response> {
  const g = await gate(req, rt);
  if (!g.ok) return g.response;

  const id = uuidSchema.safeParse(g.body.report_id);
  if (!id.success) return fail('INVALID_INPUT');

  let processing = false; // the report row was moved to `processing` (so a crash must undo it)
  let summaryId: string | null = null;
  try {
    const report = await rt.repo.getReport(id.data);
    if (!report) return fail('NOT_FOUND');
    if (!(await g.caller.onCareTeam(report.pregnancy_id))) return fail('NOT_ON_CARE_TEAM');
    if ((await g.caller.consumeQuota('process-report')) === 'rate_limited') return fail('RATE_LIMITED');

    const [source, catalog] = await Promise.all([rt.repo.contextSource(report.pregnancy_id), rt.repo.labCatalog()]);
    const context = buildContext(source);
    const files = rt.provider.needsFiles
      ? await Promise.all(
          report.files.map(async (f) => ({ mime_type: f.mime_type, data: await rt.repo.downloadFile(f.storage_path) })),
        )
      : [];

    await rt.repo.setReportStatus(report.id, 'processing');
    processing = true;
    const result = await generateDraft(rt, {
      pregnancyId: report.pregnancy_id,
      sourceType: 'report',
      sourceId: report.id,
      schema: extractionOutputSchema,
      call: () => rt.provider.extractReport({ context, report_type: report.type, files }),
    });
    if (!result.ok) {
      await rt.repo.setReportStatus(report.id, 'failed', 'AI_FAILED');
      return fail('AI_FAILED');
    }
    summaryId = result.summaryId;

    const { rows, values } = toLabResults(
      result.output.lab_values,
      {
        report_id: report.id,
        pregnancy_id: report.pregnancy_id,
        observed_on: report.report_date,
        trimester: context.gestational_age?.trimester ?? null,
      },
      catalog,
    );
    const inserted = await rt.repo.replaceExtractedLabs(report.id, rows);
    const inputHash = await sha256Hex(JSON.stringify({ context, report: report.id, v: rt.provider.promptVersion }));
    await rt.repo.completeSummary(
      result.summaryId,
      { lab_values: values, summary: result.output.summary },
      { input_hash: inputHash, token_usage: result.usage },
    );
    await rt.repo.setReportStatus(report.id, 'done');
    return json(200, { summary_id: result.summaryId, lab_results_inserted: inserted });
  } catch {
    // Leave nothing stuck in "processing"/"generating": the doctor can retry or enter values by hand.
    try {
      if (summaryId) await rt.repo.failSummary(summaryId, 'internal error');
      if (processing) await rt.repo.setReportStatus(id.data, 'failed', 'INTERNAL');
    } catch {
      /* nothing more to do */
    }
    return internalError();
  }
}
