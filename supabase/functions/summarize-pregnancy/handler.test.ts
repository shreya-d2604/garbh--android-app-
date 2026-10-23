import assert from 'node:assert/strict';

import { MockProvider } from '../_shared/gemini.ts';
import { authAs, fakeCaller, fakeRepo, IDS, post } from '../_shared/testing.ts';
import { handleSummarizePregnancy } from './handler.ts';

const make = (caller = fakeCaller(), provider = new MockProvider()) => {
  const repo = fakeRepo();
  return { repo, provider, rt: { authenticate: authAs(caller), repo, provider } };
};

Deno.test('summarize-pregnancy: cumulative draft with no source id', async () => {
  const m = make();
  const res = await handleSummarizePregnancy(post({ pregnancy_id: IDS.pregnancy }), m.rt);
  assert.equal(res.status, 200);
  const { summary_id } = await res.json();
  const s = m.repo.state.summaries.get(summary_id)!;
  assert.equal(s.status, 'draft');
  assert.equal(s.source_type, 'cumulative');
  assert.equal(s.source_id, null);
});

Deno.test('summarize-pregnancy: error mapping', async () => {
  const run = (m: ReturnType<typeof make>, body: unknown = { pregnancy_id: IDS.pregnancy }) =>
    handleSummarizePregnancy(post(body), m.rt);
  assert.equal((await handleSummarizePregnancy(post({ pregnancy_id: IDS.pregnancy }), { ...make().rt, authenticate: authAs(null) })).status, 401);
  assert.equal((await run(make(), {})).status, 400);
  assert.equal((await run(make(), { pregnancy_id: '11111111-1111-4111-8111-111111111111' })).status, 404);
  assert.equal((await run(make(fakeCaller({ team: false })))).status, 403);
  assert.equal((await run(make(fakeCaller({ quota: 'rate_limited' })))).status, 429);
  assert.equal((await run(make(fakeCaller(), new MockProvider('invalid')))).status, 502);
});
