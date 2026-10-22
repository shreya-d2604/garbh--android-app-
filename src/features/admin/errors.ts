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
    return /mrn/i.test(error.message ?? '') ? 'common:errors.MRN_TAKEN' : 'admin:errors.DUPLICATE';
  }
  if (error.code === '23503') return 'admin:errors.IN_USE';
  if (error.message === 'EMAIL_TAKEN') return 'admin:errors.EMAIL_TAKEN';
  return `common:${rpcErrorKey(error)}`;
}
