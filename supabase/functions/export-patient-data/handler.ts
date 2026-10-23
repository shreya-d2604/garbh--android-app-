// export-patient-data: DPDP right of access (PLAN.md §7.6 #7, §12). Admin only. Returns every row held
// about one patient (or one user, for people without a patient record) as JSON, and writes the audit
// row action = 'export'. Pure: no imports, unit-tested with a fake port. Never log the export.

export type ExportResult = { ok: true; data: unknown } | { ok: false; code: string };

export interface ExportPort {
  /** Verifies the bearer token. role = public.auth_role() of the caller (null when inactive / unknown). */
  authenticate(
    authorization: string | null,
  ): Promise<{ userId: string; role: string | null } | null>;
  exportData(
    actor: string,
    subject: { patientId?: string; userId?: string },
  ): Promise<ExportResult>;
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
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fail(code: string): Response {
  return json(STATUS[code] ?? 500, { error: STATUS[code] ? code : 'GENERIC' });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler(port: ExportPort): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return fail('NOT_ALLOWED');

    const caller = await port.authenticate(req.headers.get('Authorization'));
    if (!caller) return fail('NOT_AUTHENTICATED');
    if (caller.role !== 'admin') return fail('NOT_ALLOWED');

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await req.json();
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return fail('INVALID_INPUT');
      body = parsed as Record<string, unknown>;
    } catch {
      return fail('INVALID_INPUT');
    }

    // Exactly one of patient_id / user_id.
    const hasPatient = body.patient_id !== undefined && body.patient_id !== null;
    const hasUser = body.user_id !== undefined && body.user_id !== null;
    if (hasPatient === hasUser) return fail('INVALID_INPUT');
    const value = hasPatient ? body.patient_id : body.user_id;
    if (typeof value !== 'string' || !UUID_RE.test(value)) return fail('INVALID_INPUT');
    const subject = hasPatient
      ? { patientId: value.toLowerCase() }
      : { userId: value.toLowerCase() };

    try {
      const result = await port.exportData(caller.userId, subject);
      if (!result.ok) return fail(result.code);
      return json(200, result.data);
    } catch {
      console.error('export-patient-data: unexpected failure'); // no details: they may contain PHI
      return fail('GENERIC');
    }
  };
}
