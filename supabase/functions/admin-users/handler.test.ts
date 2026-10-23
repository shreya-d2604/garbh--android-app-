// Deno tests for admin-users (run with `npm run test:functions`). The Supabase client is mocked:
// handler.ts only talks to the AdminPort below.
import assert from 'node:assert/strict';

import { createHandler, type AdminPort, type DbResult } from './handler.ts';

const ADMIN = '00000000-0000-4000-a000-000000000001';
const DOCTOR = '00000000-0000-4000-a000-000000000002';
const TARGET = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';

interface Calls {
  [name: string]: unknown[][];
}

function fakePort(
  overrides: Partial<AdminPort> = {},
  caller: { userId: string; role: string | null } | null = { userId: ADMIN, role: 'admin' },
) {
  const calls: Calls = {};
  const rec = (name: string, ...args: unknown[]) => {
    (calls[name] ??= []).push(args);
  };
  const ok: DbResult = { ok: true };
  const port: AdminPort = {
    authenticate: (auth) => {
      rec('authenticate', auth);
      return Promise.resolve(caller);
    },
    createAuthUser: (a) => {
      rec('createAuthUser', a);
      return Promise.resolve({ userId: TARGET });
    },
    deleteAuthUser: (id) => {
      rec('deleteAuthUser', id);
      return Promise.resolve();
    },
    setAuthRole: (id, role) => {
      rec('setAuthRole', id, role);
      return Promise.resolve();
    },
    getStaffEmail: (id) => {
      rec('getStaffEmail', id);
      return Promise.resolve('staff@example.com');
    },
    sendSignInCode: (email) => {
      rec('sendSignInCode', email);
      return Promise.resolve(true);
    },
    scrubAuthUser: (id) => {
      rec('scrubAuthUser', id);
      return Promise.resolve();
    },
    staffApply: (...a) => {
      rec('staffApply', ...a);
      return Promise.resolve(ok);
    },
    deidentifyUser: (...a) => {
      rec('deidentifyUser', ...a);
      return Promise.resolve(ok);
    },
    getDeletionRequest: (id) => {
      rec('getDeletionRequest', id);
      return Promise.resolve({ id, user_id: TARGET, kind: 'deletion', status: 'open' });
    },
    ...overrides,
  };
  return { port, calls, handler: createHandler(port) };
}

function post(body: unknown, auth: string | null = 'Bearer token'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  return new Request('http://localhost/admin-users', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function run(
  handler: (r: Request) => Promise<Response>,
  body: unknown,
  auth?: string | null,
) {
  const res = await handler(post(body, auth));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

// ---------------------------------------------------------------- authentication / authorization
Deno.test('rejects a request without a valid token (401)', async () => {
  const { handler, calls } = fakePort({}, null);
  const r = await run(handler, { action: 'set_active', user_id: TARGET, is_active: false }, null);
  assert.equal(r.status, 401);
  assert.deepEqual(r.body, { error: 'NOT_AUTHENTICATED' });
  assert.equal(calls.staffApply, undefined);
});

for (const role of ['doctor', 'receptionist', 'patient', 'companion', null]) {
  Deno.test(`rejects a ${role ?? 'role-less'} caller (403) and touches nothing`, async () => {
    const { handler, calls } = fakePort({}, { userId: DOCTOR, role });
    const r = await run(handler, {
      action: 'create',
      email: 'new@example.com',
      full_name: 'New Doc',
      role: 'doctor',
    });
    assert.equal(r.status, 403);
    assert.deepEqual(r.body, { error: 'NOT_ALLOWED' });
    assert.equal(calls.createAuthUser, undefined);
    assert.equal(calls.staffApply, undefined);
    assert.equal(calls.deidentifyUser, undefined);
  });
}

Deno.test('only POST is accepted', async () => {
  const { handler } = fakePort();
  const res = await handler(new Request('http://localhost/admin-users', { method: 'GET' }));
  assert.equal(res.status, 403);
});

Deno.test('answers CORS preflight without authenticating', async () => {
  const { handler, calls } = fakePort();
  const res = await handler(new Request('http://localhost/admin-users', { method: 'OPTIONS' }));
  assert.equal(res.status, 204);
  assert.equal(calls.authenticate, undefined);
});

// ---------------------------------------------------------------- input validation
const invalid: Array<[string, unknown]> = [
  ['unknown action', { action: 'drop_database' }],
  ['missing action', {}],
  ['create: bad email', { action: 'create', email: 'nope', full_name: 'New Doc', role: 'doctor' }],
  ['create: missing name', { action: 'create', email: 'a@example.com', role: 'doctor' }],
  [
    'create: short name',
    { action: 'create', email: 'a@example.com', full_name: 'A', role: 'doctor' },
  ],
  [
    'create: patient role',
    { action: 'create', email: 'a@example.com', full_name: 'New Doc', role: 'patient' },
  ],
  [
    'create: bad phone',
    {
      action: 'create',
      email: 'a@example.com',
      full_name: 'New Doc',
      role: 'doctor',
      phone: 'abc',
    },
  ],
  [
    'create: bio too long',
    {
      action: 'create',
      email: 'a@example.com',
      full_name: 'New Doc',
      role: 'doctor',
      bio: 'x'.repeat(1001),
    },
  ],
  ['update: bad user id', { action: 'update', user_id: 'not-a-uuid', full_name: 'New Name' }],
  ['update: nothing to change', { action: 'update', user_id: TARGET }],
  ['set_role: unknown role', { action: 'set_role', user_id: TARGET, role: 'superuser' }],
  ['set_active: not a boolean', { action: 'set_active', user_id: TARGET, is_active: 'false' }],
  ['resend_invite: no user', { action: 'resend_invite' }],
  ['process_deletion: bad request id', { action: 'process_deletion', request_id: '123' }],
];
for (const [name, body] of invalid) {
  Deno.test(`validates input: ${name} -> 400`, async () => {
    const { handler, calls } = fakePort();
    const r = await run(handler, body);
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: 'INVALID_INPUT' });
    assert.equal(calls.createAuthUser, undefined);
    assert.equal(calls.staffApply, undefined);
    assert.equal(calls.deidentifyUser, undefined);
  });
}

Deno.test('a body that is not a JSON object -> 400', async () => {
  const { handler } = fakePort();
  const res = await handler(
    new Request('http://localhost/admin-users', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
      body: '[1,2]',
    }),
  );
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------- create
Deno.test(
  'create: makes the auth user with the role, fills the profile as the acting admin, sends the code',
  async () => {
    const { handler, calls } = fakePort();
    const r = await run(handler, {
      action: 'create',
      email: '  New.Doc@Example.com ',
      full_name: ' Dr. New Doc ',
      role: 'doctor',
      designation: 'Consultant',
      specialization: '',
      phone: '+91 98000 00000',
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { user_id: TARGET, invite_sent: true });
    assert.deepEqual(calls.createAuthUser?.[0], [
      { email: 'new.doc@example.com', role: 'doctor', fullName: 'Dr. New Doc' },
    ]);
    assert.deepEqual(calls.staffApply?.[0], [
      ADMIN,
      TARGET,
      {
        full_name: 'Dr. New Doc',
        phone: '+91 98000 00000',
        designation: 'Consultant',
        specialization: null,
        role: 'doctor',
      },
      'staff_create',
    ]);
    assert.deepEqual(calls.sendSignInCode?.[0], ['new.doc@example.com']);
  },
);

Deno.test('create: an existing email -> 409 EMAIL_TAKEN and nothing else happens', async () => {
  const { handler, calls } = fakePort({
    createAuthUser: () => Promise.resolve({ error: 'EMAIL_TAKEN' }),
  });
  const r = await run(handler, {
    action: 'create',
    email: 'a@example.com',
    full_name: 'New Doc',
    role: 'receptionist',
  });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: 'EMAIL_TAKEN' });
  assert.equal(calls.staffApply, undefined);
});

Deno.test('create: if the database step fails the new auth user is removed again', async () => {
  const { handler, calls } = fakePort({
    staffApply: () => Promise.resolve({ ok: false, code: 'INVALID_INPUT' }),
  });
  const r = await run(handler, {
    action: 'create',
    email: 'a@example.com',
    full_name: 'New Doc',
    role: 'admin',
  });
  assert.equal(r.status, 400);
  assert.deepEqual(calls.deleteAuthUser?.[0], [TARGET]);
  assert.equal(calls.sendSignInCode, undefined);
});

Deno.test(
  'create: still succeeds when the email could not be sent (invite_sent = false)',
  async () => {
    const { handler } = fakePort({ sendSignInCode: () => Promise.resolve(false) });
    const r = await run(handler, {
      action: 'create',
      email: 'a@example.com',
      full_name: 'New Doc',
      role: 'doctor',
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.invite_sent, false);
  },
);

// ---------------------------------------------------------------- update / role / active / resend
Deno.test('update: passes only the given fields', async () => {
  const { handler, calls } = fakePort();
  const r = await run(handler, {
    action: 'update',
    user_id: TARGET,
    bio: 'Hello',
    registration_no: 'MMC-1',
  });
  assert.equal(r.status, 200);
  assert.deepEqual(calls.staffApply?.[0], [
    ADMIN,
    TARGET,
    { bio: 'Hello', registration_no: 'MMC-1' },
    'staff_update',
  ]);
});

Deno.test('set_role: applies in the database, then syncs the auth role', async () => {
  const { handler, calls } = fakePort();
  const r = await run(handler, { action: 'set_role', user_id: TARGET, role: 'receptionist' });
  assert.equal(r.status, 200);
  assert.deepEqual(calls.staffApply?.[0], [
    ADMIN,
    TARGET,
    { role: 'receptionist' },
    'staff_set_role',
  ]);
  assert.deepEqual(calls.setAuthRole?.[0], [TARGET, 'receptionist']);
});

Deno.test('set_role: a database refusal is passed on and the auth role is untouched', async () => {
  const { handler, calls } = fakePort({
    staffApply: () => Promise.resolve({ ok: false, code: 'INVALID_INPUT' }),
  });
  const r = await run(handler, { action: 'set_role', user_id: TARGET, role: 'doctor' });
  assert.equal(r.status, 400);
  assert.equal(calls.setAuthRole, undefined);
});

Deno.test('set_active: deactivate and reactivate', async () => {
  const { handler, calls } = fakePort();
  assert.equal(
    (await run(handler, { action: 'set_active', user_id: TARGET, is_active: false })).status,
    200,
  );
  assert.equal(
    (await run(handler, { action: 'set_active', user_id: TARGET, is_active: true })).status,
    200,
  );
  assert.deepEqual(
    calls.staffApply?.map((c) => c[2]),
    [{ is_active: false }, { is_active: true }],
  );
});

Deno.test(
  'maps database codes to statuses (NOT_FOUND 404, anything unknown 500 GENERIC)',
  async () => {
    const notFound = fakePort({
      staffApply: () => Promise.resolve({ ok: false, code: 'NOT_FOUND' }),
    });
    assert.equal(
      (await run(notFound.handler, { action: 'set_active', user_id: TARGET, is_active: true }))
        .status,
      404,
    );
    const odd = fakePort({ staffApply: () => Promise.resolve({ ok: false, code: 'GENERIC' }) });
    const r = await run(odd.handler, { action: 'set_active', user_id: TARGET, is_active: true });
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { error: 'GENERIC' });
  },
);

Deno.test('resend_invite: emails the code to a staff account', async () => {
  const { handler, calls } = fakePort();
  const r = await run(handler, { action: 'resend_invite', user_id: TARGET });
  assert.deepEqual(r.body, { invite_sent: true });
  assert.deepEqual(calls.sendSignInCode?.[0], ['staff@example.com']);
});

Deno.test('resend_invite: not a staff account -> 404, no email sent', async () => {
  const { handler, calls } = fakePort({ getStaffEmail: () => Promise.resolve(null) });
  const r = await run(handler, { action: 'resend_invite', user_id: TARGET });
  assert.equal(r.status, 404);
  assert.equal(calls.sendSignInCode, undefined);
});

Deno.test('an unexpected exception becomes a bare 500 GENERIC (no details leak)', async () => {
  const { handler } = fakePort({
    staffApply: () => Promise.reject(new Error('secret@example.com exploded')),
  });
  const r = await run(handler, { action: 'set_active', user_id: TARGET, is_active: true });
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: 'GENERIC' });
});

// ---------------------------------------------------------------- process_deletion
Deno.test(
  'process_deletion: de-identifies as the acting admin, then scrubs the auth user',
  async () => {
    const { handler, calls } = fakePort();
    const r = await run(handler, { action: 'process_deletion', request_id: REQUEST });
    assert.equal(r.status, 200);
    assert.deepEqual(calls.deidentifyUser?.[0], [ADMIN, TARGET, REQUEST]);
    assert.deepEqual(calls.scrubAuthUser?.[0], [TARGET]);
  },
);

Deno.test('process_deletion: unknown request -> 404', async () => {
  const { handler, calls } = fakePort({ getDeletionRequest: () => Promise.resolve(null) });
  assert.equal(
    (await run(handler, { action: 'process_deletion', request_id: REQUEST })).status,
    404,
  );
  assert.equal(calls.deidentifyUser, undefined);
});

Deno.test('process_deletion: an export request or a closed request is refused', async () => {
  const exportReq = fakePort({
    getDeletionRequest: (id) =>
      Promise.resolve({ id, user_id: TARGET, kind: 'export', status: 'open' }),
  });
  assert.equal(
    (await run(exportReq.handler, { action: 'process_deletion', request_id: REQUEST })).status,
    400,
  );
  const closed = fakePort({
    getDeletionRequest: (id) =>
      Promise.resolve({ id, user_id: TARGET, kind: 'deletion', status: 'done' }),
  });
  assert.equal(
    (await run(closed.handler, { action: 'process_deletion', request_id: REQUEST })).status,
    409,
  );
  assert.equal(exportReq.calls.deidentifyUser, undefined);
  assert.equal(closed.calls.deidentifyUser, undefined);
});

Deno.test('process_deletion: when the database refuses, the auth user is left alone', async () => {
  const { handler, calls } = fakePort({
    deidentifyUser: () => Promise.resolve({ ok: false, code: 'INVALID_INPUT' }),
  });
  assert.equal(
    (await run(handler, { action: 'process_deletion', request_id: REQUEST })).status,
    400,
  );
  assert.equal(calls.scrubAuthUser, undefined);
});
