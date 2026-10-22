// Error helpers for RPC calls the doctor app makes against not-yet-merged backends.
import { rpcErrorCode } from '@/domain/rpc-errors';

export type ErrorLike = { message?: string; code?: string } | null | undefined;

/** The owning agent has not merged this RPC yet (stub from the foundation migration). */
export function isNotImplemented(error: ErrorLike): boolean {
  return rpcErrorCode(error) === 'NOT_IMPLEMENTED';
}
