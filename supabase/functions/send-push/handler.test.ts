import assert from 'node:assert/strict';

import { handleSendPush, type NotificationRow, type PushRepo } from './handler.ts';
import { ExpoPushSender, MockPushSender, pushText, safeRoute, type PushMessage } from './push.ts';

const KEY = 'service-role-test-key';
const NID = '99999999-9999-4999-8999-999999999999';

function fakePushRepo(over: { n?: Partial<NotificationRow> | null; tokens?: string[] } = {}) {
  const state = { deleted: [] as string[], sent: [] as string[], errors: [] as string[] };
  const n: NotificationRow | null =
    over.n === null ? null : { id: NID, user_id: 'u1', type: 'summary_published', data: { route: '/patient/reports/summaries/abc' }, push_sent_at: null, ...over.n };
  const tokens = (over.tokens ?? ['ExponentPushToken[good1]']).map((t, i) => ({ id: `t${i}`, expo_push_token: t }));
  const repo: PushRepo = {
    getNotification: () => Promise.resolve(n),
    tokensFor: () => Promise.resolve(tokens),
    deleteTokens: (ids) => {
      state.deleted.push(...ids);
      return Promise.resolve();
    },
    markSent: (id) => {
      state.sent.push(id);
      return Promise.resolve();
    },
    markError: (_id, e) => {
      state.errors.push(e);
      return Promise.resolve();
    },
  };
  return { repo, state };
}

const req = (body: unknown, key: string | null = KEY) =>
  new Request('http://x/send-push', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  });

Deno.test('send-push only accepts the service-role bearer', async () => {
  const { repo } = fakePushRepo();
  const sender = new MockPushSender();
  for (const key of [null, 'wrong-key', 'service-role-test-ke']) {
    const res = await handleSendPush(req({ notification_id: NID }, key), { serviceKey: KEY, repo, sender });
    assert.equal(res.status, 401);
  }
  assert.equal(sender.sent.length, 0);
  // An empty configured key never authenticates anyone.
  assert.equal((await handleSendPush(req({ notification_id: NID }, ''), { serviceKey: '', repo, sender })).status, 401);
});

Deno.test('send-push rejects a bad body', async () => {
  const { repo } = fakePushRepo();
  const res = await handleSendPush(req({ notification_id: 'x' }), { serviceKey: KEY, repo, sender: new MockPushSender() });
  assert.equal(res.status, 400);
});

Deno.test('lock-screen text is generic and the route is passed for the tap', async () => {
  const { repo, state } = fakePushRepo({ tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'] });
  const sender = new MockPushSender();
  const res = await handleSendPush(req({ notification_id: NID }), { serviceKey: KEY, repo, sender });
  assert.deepEqual(await res.json(), { sent: 2 });
  assert.equal(sender.sent.length, 2);
  const m = sender.sent[0] as PushMessage;
  assert.equal(m.title, 'GARBH');
  assert.equal(m.body, 'New update from GARBH: your report summary is ready');
  assert.deepEqual(m.data, { notification_id: NID, route: '/patient/reports/summaries/abc' });
  assert.deepEqual(state.sent, [NID]);
});

Deno.test('push text never carries clinical detail', () => {
  const types = ['appointment_booked', 'appointment_changed', 'appointment_cancelled', 'appointment_reminder', 'consultation_published', 'summary_published', 'report_added', 'account_verified', 'visit_due', 'companion_request', 'companion_approved', 'companion_revoked', 'week_update', 'trimester_change', 'ai_draft_ready', 'patient_checked_in', 'care_team_changed', 'data_quality', 'something_new'];
  for (const t of types) {
    const { title, body } = pushText(t);
    assert.equal(title, 'GARBH');
    assert.match(body, /^New update from GARBH: [a-z ]+$/);
    assert.ok(!/\d/.test(body), 'no times, weeks or values on the lock screen');
  }
});

Deno.test('dead tokens are pruned, live ones still get the push', async () => {
  const { repo, state } = fakePushRepo({ tokens: ['ExponentPushToken[live]', 'ExponentPushToken[Dead1]'] });
  const res = await handleSendPush(req({ notification_id: NID }), { serviceKey: KEY, repo, sender: new MockPushSender() });
  assert.deepEqual(await res.json(), { sent: 1 });
  assert.deepEqual(state.deleted, ['t1']);
  assert.deepEqual(state.sent, [NID]);
});

Deno.test('all tokens dead: pruned, nothing sent, error recorded', async () => {
  const { repo, state } = fakePushRepo({ tokens: ['ExponentPushToken[Dead1]'] });
  const res = await handleSendPush(req({ notification_id: NID }), { serviceKey: KEY, repo, sender: new MockPushSender() });
  assert.deepEqual(await res.json(), { sent: 0 });
  assert.deepEqual(state.deleted, ['t0']);
  assert.deepEqual(state.sent, []);
  assert.deepEqual(state.errors, ['DeviceNotRegistered']);
});

Deno.test('skips unknown, already-sent and token-less notifications', async () => {
  const sender = new MockPushSender();
  for (const over of [{ n: null }, { n: { push_sent_at: '2026-10-22T00:00:00Z' } }, { tokens: [] }]) {
    const { repo } = fakePushRepo(over);
    const res = await handleSendPush(req({ notification_id: NID }), { serviceKey: KEY, repo, sender });
    assert.deepEqual(await res.json(), { sent: 0 });
  }
  assert.equal(sender.sent.length, 0);
});

Deno.test('a failing sender is reported without losing tokens', async () => {
  const { repo, state } = fakePushRepo();
  const sender = { name: 'x', send: () => Promise.reject(new Error('net down')) };
  const res = await handleSendPush(req({ notification_id: NID }), { serviceKey: KEY, repo, sender });
  assert.equal(res.status, 502);
  assert.deepEqual(state.errors, ['SEND_FAILED']);
  assert.deepEqual(state.deleted, []);
});

Deno.test('safeRoute only lets in-app paths through', () => {
  assert.equal(safeRoute({ route: '/patient/appointments/1' }), '/patient/appointments/1');
  for (const bad of ['https://evil.test', '//evil.test', 'patient', 5, null]) assert.equal(safeRoute({ route: bad }), undefined);
  assert.equal(safeRoute(null), undefined);
});

Deno.test('ExpoPushSender maps tickets (fake fetch, no network)', async () => {
  let sentBody = '';
  const fakeFetch = ((_u: string, init: RequestInit) => {
    sentBody = String(init.body);
    return Promise.resolve(new Response(JSON.stringify({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] })));
  }) as unknown as typeof fetch;
  const msgs = ['a', 'b'].map((t): PushMessage => ({ to: t, title: 'GARBH', body: 'x', data: { notification_id: NID }, sound: 'default', channelId: 'default' }));
  const tickets = await new ExpoPushSender(fakeFetch).send(msgs);
  assert.deepEqual(tickets, [{ status: 'ok' }, { status: 'error', error: 'DeviceNotRegistered' }]);
  assert.equal(JSON.parse(sentBody).length, 2);
  const down = (() => Promise.resolve(new Response('', { status: 500 }))) as unknown as typeof fetch;
  await assert.rejects(new ExpoPushSender(down).send(msgs), /expo http 500/);
});
