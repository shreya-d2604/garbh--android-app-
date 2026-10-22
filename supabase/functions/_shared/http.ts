// Response helpers. Error bodies are always `{ error: CODE }` (docs/contracts.md §5); no
// message ever contains patient data.
export type ErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'INVALID_INPUT'
  | 'NOT_ON_CARE_TEAM'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'AI_FAILED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  NOT_AUTHENTICATED: 401,
  INVALID_INPUT: 400,
  NOT_ON_CARE_TEAM: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  AI_FAILED: 502,
  INTERNAL: 500,
};

const HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export function fail(code: ErrorCode): Response {
  return json(STATUS[code], { error: code });
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: HEADERS }) : null;
}

/** Parses the JSON body, or null when it is missing or not JSON. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
