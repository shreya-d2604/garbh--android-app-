// Deno tests for export-patient-data (`npm run test:functions`). The Supabase client is mocked.
import assert from 'node:assert/strict';

import { createHandler, type ExportPort, type ExportResult } from './handler.ts';

const ADMIN = '00000000-0000-4000-a000-000000000001';
const SUBJECT = '33333333-3333-4333-8333-333333333333';

function fake(caller: { userId: string; role: string | null } | null = { userId: ADMIN, role: 'admin' }, result?: ExportResult) {
  const exported: unknown[][] = [];
  const port: ExportPort = {
    authenticate: () => Promise.resolve(caller),
    exportData: (actor, subject) => {
      exported.push([actor, subject]);
      return Promise.resolve(result ?? { ok: true, data: { patient: { id: SUBJECT }, pregnancies: [] } });
    },
  };
  return { exported, handler: createHandler(port) };
}

const post = (body: unknown, auth: string | null = 'Bearer t') =>
  new Request('http://localhost/export-patient-data', {
    method: 'POST',
    headers: auth ? { Authorization: auth } : {},
    body: JSON.stringify(body),
  });

Deno.test('401 without a valid token', async () => {
  const { handler, exported } = fake(null);
  assert.equal((await handler(post({ patient_id: SUBJECT }, null))).status, 401);
  assert.equal(exported.length, 0);
});

for (const role of ['doctor', 'receptionist', 'patient', 'companion', null]) {
  Deno.test(`403 for a ${role ?? 'role-less'} caller, nothing exported`, async () => {
    const { handler, exported } = fake({ userId: ADMIN, role });
    assert.equal((await handler(post({ patient_id: SUBJECT }))).status, 403);
    assert.equal(exported.length, 0);
  });
}

Deno.test('validates input: exactly one valid uuid', async () => {
  const { handler, exported } = fake();
  for (const body of [{}, { patient_id: 'nope' }, { patient_id: SUBJECT, user_id: SUBJECT }, { user_id: 5 }, [1]]) {
    assert.equal((await handler(post(body))).status, 400);
  }
  assert.equal(exported.length, 0);
});

Deno.test('exports by patient id as the acting admin', async () => {
  const { handler, exported } = fake();
  const res = await handler(post({ patient_id: SUBJECT.toUpperCase() }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await res.json(), { patient: { id: SUBJECT }, pregnancies: [] });
  assert.deepEqual(exported[0], [ADMIN, { patientId: SUBJECT }]);
});

Deno.test('exports by user id', async () => {
  const { handler, exported } = fake();
  assert.equal((await handler(post({ user_id: SUBJECT }))).status, 200);
  assert.deepEqual(exported[0], [ADMIN, { userId: SUBJECT }]);
});

Deno.test('passes database refusals on (404) and hides unknown ones (500 GENERIC)', async () => {
  const notFound = fake(undefined, { ok: false, code: 'NOT_FOUND' });
  assert.equal((await notFound.handler(post({ patient_id: SUBJECT }))).status, 404);
  const odd = fake(undefined, { ok: false, code: 'boom: secret@example.com' });
  const res = await odd.handler(post({ patient_id: SUBJECT }));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'GENERIC' });
});
