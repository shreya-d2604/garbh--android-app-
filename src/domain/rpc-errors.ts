// RPC error contract. SQL functions raise exceptions whose MESSAGE is one of these codes
// (see docs/contracts.md). The UI maps a code to a translated message with rpcErrorKey().
// Only the head edits this list; agents request new codes in their report.

export const RPC_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'NOT_ALLOWED',
  'NOT_IMPLEMENTED',
  'INVALID_INPUT',
  'CONSENT_REQUIRED',
  'ALREADY_ONBOARDED',
  'NOT_FOUND',
  // booking
  'SLOT_TAKEN',
  'OUTSIDE_AVAILABILITY',
  'DOCTOR_UNAVAILABLE',
  'TOO_SOON',
  'TOO_FAR_AHEAD',
  'CANCEL_CUTOFF',
  'MAX_UPCOMING',
  'NOT_ON_CARE_TEAM',
  'DOCTOR_NOT_ACCEPTING',
  'INVALID_STATUS_CHANGE',
  // patients / care team
  'MRN_TAKEN',
  'NOT_VERIFIED',
  'PRIMARY_REQUIRED',
  'SOFT_DELETE_REQUIRED',
  // staff accounts (admin-users Edge Function)
  'EMAIL_TAKEN',
  // companions
  'INVALID_CODE',
  'CODE_EXPIRED',
  'RATE_LIMITED',
  'ALREADY_LINKED',
] as const;

export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

const CODE_SET = new Set<string>(RPC_ERROR_CODES);

/** Postgres SQLSTATEs that map onto a code without the SQL raising it explicitly. */
const SQLSTATE_CODES: Record<string, RpcErrorCode> = {
  '23P01': 'SLOT_TAKEN', // exclusion constraint no_doctor_overlap
  '42501': 'NOT_ALLOWED', // insufficient privilege / RLS violation
};

export function rpcErrorCode(
  error: { message?: string; code?: string } | null | undefined,
): RpcErrorCode | null {
  if (!error) return null;
  if (error.message && CODE_SET.has(error.message)) return error.message as RpcErrorCode;
  if (error.code && SQLSTATE_CODES[error.code]) return SQLSTATE_CODES[error.code] ?? null;
  return null;
}

/** i18n key (namespace 'common') for an error; falls back to a generic message. */
export function rpcErrorKey(error: { message?: string; code?: string } | null | undefined): string {
  const code = rpcErrorCode(error);
  return code ? `errors.${code}` : 'errors.GENERIC';
}
