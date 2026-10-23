import assert from 'node:assert/strict';

import { MockProvider } from '../_shared/gemini.ts';
import { authAs, fakeCaller, fakeRepo, IDS, PII, post } from '../_shared/testing.ts';
import { handleSummarizeConsultation } from './handler.ts';

const make = (caller = fakeCaller(), provider = new MockProvider()) => {
  const repo = fakeRepo();
  return { repo, provider, rt: { authenticate: authAs(caller), repo, provider } };
};

Deno.test('summarize-consultation: draft only, scrubbed context, ids returned', async () => {
  const seen: string[] = [];
  const provider = new MockProvider();
  const orig = provider.summarizeConsultation.bind(provider);
  provider.summarizeConsultation = (i) => {
    seen.push(JSON.stringify(i));
    return orig(i);
  };
  const m = make(fakeCaller(), provider);
  const res = await handleSummarizeConsultation(post({ consultation_id: IDS.consultation }), m.rt);
  assert.equal(res.status, 200);
  const { summary_id } = await res.json();
  const s = m.repo.state.summaries.get(summary_id)!;
  assert.equal(s.status, 'draft');
  assert.equal(s.source_type, 'consultation');
  assert.equal(s.source_id, IDS.consultation);
  assert.equal(s.draft?.lab_values, undefined);
  for (const secret of [PII.name, PII.phone, PII.email, PII.doctor]) assert.ok(!seen[0]!.includes(secret));
});

Deno.test('summarize-consultation: 401 / 400 / 404 / 403 / 429 / 502', async () => {
  const run = (m: ReturnType<typeof make>, body: unknown = { consultation_id: IDS.consultation }) =>
    handleSummarizeConsultation(post(body), m.rt);
  assert.equal((await handleSummarizeConsultation(post({ consultation_id: IDS.consultation }), { ...make().rt, authenticate: authAs(null) })).status, 401);
  assert.equal((await run(make(), { consultation_id: 5 })).status, 400);
  assert.equal((await run(make(), { consultation_id: '11111111-1111-4111-8111-111111111111' })).status, 404);
  assert.equal((await run(make(fakeCaller({ team: false })))).status, 403);
  assert.equal((await run(make(fakeCaller({ quota: 'rate_limited' })))).status, 429);
  const failing = make(fakeCaller(), new MockProvider('fail_always'));
  assert.equal((await run(failing)).status, 502);
  assert.equal(failing.provider.callCount, 2);
  assert.equal([...failing.repo.state.summaries.values()][0]?.status, 'failed');
});
