// admin-users: request handling for staff account management (PLAN.md §7.6 #2) and the account
// deletion half of DPDP requests (§12). Pure: no imports, so it is unit-tested with a fake port.
// index.ts wires the real Supabase clients (port.ts). Never log request bodies: they hold PII.

export const STAFF_ROLES = ['admin', 'doctor', 'receptionist'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type DbResult = { ok: true } | { ok: false; code: string };

export interface DeletionRequest {
  id: string;
  user_id: string;
  kind: string;
  status: string;
}

export interface AdminPort {
  /** Verifies the bearer token. role = public.auth_role() of the caller (null when inactive / unknown). */
  authenticate(authorization: string | null): Promise<{ userId: string; role: string | null } | null>;
  createAuthUser(args: {
    email: string;
    role: StaffRole;
    fullName: string;
  }): Promise<{ userId: string } | { error: 'EMAIL_TAKEN' | 'FAILED' }>;
  deleteAuthUser(userId: string): Promise<void>;
  /** Keeps auth app_metadata.role in step with profiles.role. */
  setAuthRole(userId: string, role: StaffRole): Promise<void>;
  /** The staff member's sign-in email, or null when the user is not a (live) staff account. */
  getStaffEmail(userId: string): Promise<string | null>;
  /** Emails the 6-digit sign-in code (the "invite"). Returns false when sending failed. */
  sendSignInCode(email: string): Promise<boolean>;
  /** Bans the auth user and replaces the email so the address is gone from auth. */
  scrubAuthUser(userId: string): Promise<void>;
  staffApply(actor: string, userId: string, args: Record<string, unknown>, event: string): Promise<DbResult>;
  deidentifyUser(actor: string, userId: string, requestId: string): Promise<DbResult>;
  getDeletionRequest(requestId: string): Promise<DeletionRequest | null>;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STATUS: Record<string, number> = {
  NOT_AUTHENTICATED: 401,
  NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INVALID_STATUS_CHANGE: 409,
  EMAIL_TAKEN: 409,
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function fail(code: string): Response {
  return json(STATUS[code] ?? 500, { error: STATUS[code] ? code : 'GENERIC' });
}

class InvalidInput extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ]{10,15}$/;

function uuid(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new InvalidInput(key);
  return v.toLowerCase();
}

function text(body: Record<string, unknown>, key: string, max: number, min = 0): string | null | undefined {
  if (!(key in body)) return undefined;
  const v = body[key];
  if (v === null) return null;
  if (typeof v !== 'string') throw new InvalidInput(key);
  const t = v.trim();
  if (t.length === 0) {
    if (min > 0) throw new InvalidInput(key);
    return null;
  }
  if (t.length < min || t.length > max) throw new InvalidInput(key);
  return t;
}

function role(body: Record<string, unknown>): StaffRole {
  const v = body.role;
  if (typeof v !== 'string' || !(STAFF_ROLES as readonly string[]).includes(v)) throw new InvalidInput('role');
  return v as StaffRole;
}

/** The profile / staff fields an admin may set, validated. Only keys present in the body are returned. */
export function staffFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const full = text(body, 'full_name', 100, 2);
  if (full !== undefined) out.full_name = full;
  const phone = text(body, 'phone', 20);
  if (phone !== undefined) {
    if (phone !== null && !PHONE_RE.test(phone)) throw new InvalidInput('phone');
    out.phone = phone;
  }
  for (const [key, max] of [
    ['designation', 100],
    ['specialization', 100],
    ['registration_no', 50],
    ['bio', 1000],
  ] as const) {
    const v = text(body, key, max);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

type Ctx = { port: AdminPort; actor: string; body: Record<string, unknown> };

async function create({ port, actor, body }: Ctx): Promise<Response> {
  const email = text(body, 'email', 254, 3);
  if (!email || !EMAIL_RE.test(email)) throw new InvalidInput('email');
  const fullName = text(body, 'full_name', 100, 2);
  if (!fullName) throw new InvalidInput('full_name');
  const newRole = role(body);
  const fields = staffFields(body); // validate everything before the first side effect

  const created = await port.createAuthUser({ email: email.toLowerCase(), role: newRole, fullName });
  if ('error' in created) return fail(created.error === 'EMAIL_TAKEN' ? 'EMAIL_TAKEN' : 'GENERIC');

  const applied = await port.staffApply(actor, created.userId, fields, 'staff_create');
  if (!applied.ok) {
    await port.deleteAuthUser(created.userId); // do not leave a half-created account behind
    return fail(applied.code);
  }
  const inviteSent = await port.sendSignInCode(email.toLowerCase());
  return json(200, { user_id: created.userId, invite_sent: inviteSent });
}

async function update({ port, actor, body }: Ctx): Promise<Response> {
  const userId = uuid(body, 'user_id');
  const fields = staffFields(body);
  if (Object.keys(fields).length === 0) throw new InvalidInput('fields');
  const r = await port.staffApply(actor, userId, fields, 'staff_update');
  return r.ok ? json(200, { ok: true }) : fail(r.code);
}

async function setRole({ port, actor, body }: Ctx): Promise<Response> {
  const userId = uuid(body, 'user_id');
  const newRole = role(body);
  const r = await port.staffApply(actor, userId, { role: newRole }, 'staff_set_role');
  if (!r.ok) return fail(r.code);
  await port.setAuthRole(userId, newRole);
  return json(200, { ok: true });
}

async function setActive({ port, actor, body }: Ctx): Promise<Response> {
  const userId = uuid(body, 'user_id');
  if (typeof body.is_active !== 'boolean') throw new InvalidInput('is_active');
  const r = await port.staffApply(actor, userId, { is_active: body.is_active }, 'staff_set_active');
  return r.ok ? json(200, { ok: true }) : fail(r.code);
}

async function resendInvite({ port, body }: Ctx): Promise<Response> {
  const userId = uuid(body, 'user_id');
  const email = await port.getStaffEmail(userId);
  if (!email) return fail('NOT_FOUND');
  return json(200, { invite_sent: await port.sendSignInCode(email) });
}

async function processDeletion({ port, actor, body }: Ctx): Promise<Response> {
  const requestId = uuid(body, 'request_id');
  const req = await port.getDeletionRequest(requestId);
  if (!req) return fail('NOT_FOUND');
  if (req.kind !== 'deletion') return fail('INVALID_INPUT');
  if (req.status !== 'open' && req.status !== 'in_progress') return fail('INVALID_STATUS_CHANGE');
  const r = await port.deidentifyUser(actor, req.user_id, requestId);
  if (!r.ok) return fail(r.code);
  await port.scrubAuthUser(req.user_id);
  return json(200, { ok: true });
}

const ACTIONS: Record<string, (ctx: Ctx) => Promise<Response>> = {
  create,
  update,
  set_role: setRole,
  set_active: setActive,
  resend_invite: resendInvite,
  process_deletion: processDeletion,
};

export function createHandler(port: AdminPort): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return fail('NOT_ALLOWED');

    // 1. Who is calling? Must be an active admin (public.auth_role() = 'admin'), checked server-side.
    const caller = await port.authenticate(req.headers.get('Authorization'));
    if (!caller) return fail('NOT_AUTHENTICATED');
    if (caller.role !== 'admin') return fail('NOT_ALLOWED');

    // 2. What do they want?
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new InvalidInput('body');
      body = parsed as Record<string, unknown>;
    } catch {
      return fail('INVALID_INPUT');
    }
    const action = typeof body.action === 'string' ? ACTIONS[body.action] : undefined;
    if (!action) return fail('INVALID_INPUT');

    try {
      return await action({ port, actor: caller.userId, body });
    } catch (e) {
      if (e instanceof InvalidInput) return fail('INVALID_INPUT');
      console.error('admin-users: unexpected failure'); // no details: they may contain PII
      return fail('GENERIC');
    }
  };
}
