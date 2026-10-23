// Maps any error from Supabase (RPC, PostgREST, Edge Functions) to a FULLY NAMESPACED i18n key,
// so it can be used from any namespace: t(adminErrorKey(error)).
import { rpcErrorKey } from '@/domain/rpc-errors';

export interface ErrorLike {
  message?: string;
  code?: string;
}

export function adminErrorKey(error: ErrorLike | null | undefined): string {
  if (!error) return 'common:errors.GENERIC';
  if (error.code === '23505' || error.message === 'DUPLICATE') {
    const message = error.message ?? '';
    if (/mrn/i.test(message)) return 'common:errors.MRN_TAKEN';
    if (/one_active/i.test(message)) return 'admin:errors.ACTIVE_PREGNANCY';
    return 'admin:errors.DUPLICATE';
  }
  if (error.message === 'INVITE_FAILED') return 'admin:users.inviteFailed';
  if (error.code === '23503') return 'admin:errors.IN_USE';
  return `common:${rpcErrorKey(error)}`;
}
