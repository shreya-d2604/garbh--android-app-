import assert from 'node:assert/strict';

import { MockProvider } from '../_shared/gemini.ts';
import { authAs, fakeCaller, fakeRepo, IDS, PII, post } from '../_shared/testing.ts';
import { handleProcessReport } from './handler.ts';

function rt(opts: { caller?: ReturnType<typeof fakeCaller> | null; provider?: MockProvider; repo?: ReturnType<typeof fakeRepo> } = {}) {
  const repo = opts.repo ?? fakeRepo();
  const provider = opts.provider ?? new MockProvider();
  return { repo, provider, rt: { authenticate: authAs(opts.caller === undefined ? fakeCaller() : opts.caller), repo, provider } };
}

const call = (r: ReturnType<typeof rt>, body: unknown = { report_id: IDS.report }, headers?: Record<string, string>) =>
  handleProcessReport(post(body, headers), r.rt);

Deno.test('401 without a valid JWT', async () => {
  const r = rt({ caller: null });
  const res = await call(r);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'NOT_AUTHENTICATED' });
  assert.equal(r.repo.state.summaries.size, 0);
});

Deno.test('400 on a malformed body', async () => {
  for (const body of [{ report_id: 'nope' }, {}, '{not json', []]) {
    const res = await call(rt(), body);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'INVALID_INPUT' });
  }
});

Deno.test('404 for an unknown report', async () => {
  const res = await call(rt(), { report_id: '11111111-1111-4111-8111-111111111111' });
  assert.equal(res.status, 404);
});

Deno.test('403 when the caller is not on the care team, and nothing is written', async () => {
  const r = rt({ caller: fakeCaller({ team: false }) });
  const res = await call(r);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'NOT_ON_CARE_TEAM' });
  assert.equal(r.repo.state.summaries.size, 0);
  assert.equal(r.repo.state.reportStatus.length, 0);
  assert.equal(r.provider.callCount, 0);
});

Deno.test('429 when the hourly quota is used up, before any work', async () => {
  const r = rt({ caller: fakeCaller({ quota: 'rate_limited' }) });
  const res = await call(r);
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'RATE_LIMITED' });
  assert.equal(r.provider.callCount, 0);
  assert.equal(r.repo.state.summaries.size, 0);
});

Deno.test('success: unverified lab rows with codes and flags, and a DRAFT summary', async () => {
  const r = rt();
  const res = await call(r);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.lab_results_inserted, 2);

  const summary = r.repo.state.summaries.get(body.summary_id)!;
  assert.equal(summary.status, 'draft', 'AI output is a draft, never published');
  assert.equal(summary.source_type, 'report');
  assert.equal(summary.source_id, IDS.report);
  assert.equal(summary.model, 'mock-1');
  assert.ok(summary.draft?.summary.headline);
  assert.equal(summary.draft?.lab_values?.[0]?.test_code, 'HB');

  const hb = r.repo.state.labs.find((l) => l.test_code === 'HB')!;
  assert.equal(hb.flag, 'low');
  assert.equal(hb.verified, false);
  assert.equal(hb.source, 'ai_extracted');
  assert.equal(hb.pregnancy_id, IDS.pregnancy);
  assert.equal(r.repo.state.labs.find((l) => l.test_code === 'PLT')?.flag, 'normal');
  assert.deepEqual(r.repo.state.reportStatus.map((s) => s.status), ['processing', 'done']);
  assert.equal(r.repo.state.superseded, 1, 'earlier drafts of this report are superseded');
});

Deno.test('the provider never sees patient identifiers', async () => {
  const seen: string[] = [];
  const provider = new MockProvider();
  const orig = provider.extractReport.bind(provider);
  provider.extractReport = (input) => {
    seen.push(JSON.stringify(input));
    return orig(input);
  };
  await call(rt({ provider }));
  assert.equal(seen.length, 1);
  for (const secret of [PII.name, PII.mrn, PII.phone, PII.email, PII.address, PII.doctor]) assert.ok(!seen[0]!.includes(secret));
});

Deno.test('a transient provider failure is retried once and succeeds', async () => {
  const provider = new MockProvider('fail_once');
  const r = rt({ provider });
  const res = await call(r);
  assert.equal(res.status, 200);
  assert.equal(provider.callCount, 2);
  assert.equal([...r.repo.state.summaries.values()][0]?.status, 'draft');
});

Deno.test('persistent failure: exactly 2 attempts, summary failed, report failed, 502', async () => {
  const provider = new MockProvider('fail_always');
  const r = rt({ provider });
  const res = await call(r);
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'AI_FAILED' });
  assert.equal(provider.callCount, 2, 'retry once, not more');
  const [summary] = [...r.repo.state.summaries.values()];
  assert.equal(summary?.status, 'failed');
  assert.match(summary?.error ?? '', /after 2 attempts/);
  assert.deepEqual(r.repo.state.reportStatus.map((s) => s.status), ['processing', 'failed']);
  assert.equal(r.repo.state.labs.length, 0, 'no lab rows from a failed run');
});

Deno.test('invalid model output is treated as a failure, without leaking values into the error', async () => {
  const provider = new MockProvider('invalid');
  const r = rt({ provider });
  const res = await call(r);
  assert.equal(res.status, 502);
  assert.equal(provider.callCount, 2);
  const [summary] = [...r.repo.state.summaries.values()];
  assert.equal(summary?.status, 'failed');
  assert.match(summary?.error ?? '', /invalid output/);
  assert.ok(!summary?.error?.includes('42'), 'the offending value is not echoed');
});

Deno.test('a crash after processing started leaves nothing stuck', async () => {
  const repo = fakeRepo({ replaceExtractedLabs: () => Promise.reject(new Error('boom')) });
  const r = rt({ repo });
  const res = await call(r);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'INTERNAL' });
  assert.equal([...repo.state.summaries.values()][0]?.status, 'failed');
  assert.equal(repo.state.reportStatus.at(-1)?.status, 'failed');
});

Deno.test('a real provider gets the files downloaded (mock skips them)', async () => {
  const r = rt();
  await call(r);
  assert.equal(r.repo.state.downloads.length, 0, 'mock does not need file bytes');
  const real = new MockProvider();
  Object.defineProperty(real, 'needsFiles', { value: true });
  const r2 = rt({ provider: real });
  await call(r2);
  assert.deepEqual(r2.repo.state.downloads, ['p/q/r/file.pdf']);
});
