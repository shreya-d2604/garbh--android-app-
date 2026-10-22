// Real Supabase wiring for handler.ts. The client factory is injected so this file has no import of
// its own (index.ts passes npm:@supabase/supabase-js; scripts may pass the node build).
// The service-role key stays inside the Edge Function runtime: it is never returned or logged.
import type { AdminPort, DbResult, StaffRole } from './handler.ts';

// deno-lint-ignore no-explicit-any
type Client = any;
export type CreateClient = (url: string, key: string, options?: Record<string, unknown>) => Client;

export interface Env {
  url: string;
  anonKey: string;
  serviceKey: string;
}

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

// The SQL functions raise an UPPER_SNAKE code as the message (docs/contracts.md).
const KNOWN = ['NOT_ALLOWED', 'NOT_FOUND', 'INVALID_INPUT', 'INVALID_STATUS_CHANGE', 'NOT_AUTHENTICATED'];
function toResult(error: { message?: string } | null): DbResult {
  if (!error) return { ok: true };
  return { ok: false, code: KNOWN.includes(error.message ?? '') ? (error.message as string) : 'GENERIC' };
}

export function createPort(createClient: CreateClient, env: Env): AdminPort {
  const service = createClient(env.url, env.serviceKey, NO_SESSION);

  return {
    async authenticate(authorization) {
      if (!authorization) return null;
      const asUser = createClient(env.url, env.anonKey, {
        ...NO_SESSION,
        global: { headers: { Authorization: authorization } },
      });
      const token = authorization.replace(/^Bearer\s+/i, '');
      const { data, error } = await asUser.auth.getUser(token);
      if (error || !data?.user) return null;
      const { data: role, error: roleError } = await asUser.rpc('auth_role');
      if (roleError) return null;
      return { userId: data.user.id as string, role: (role as string | null) ?? null };
    },

    async createAuthUser({ email, role, fullName }) {
      const { data, error } = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: { role },
        user_metadata: { full_name: fullName },
      });
      if (error || !data?.user) {
        return { error: error?.code === 'email_exists' ? 'EMAIL_TAKEN' : 'FAILED' };
      }
      return { userId: data.user.id as string };
    },

    async deleteAuthUser(userId) {
      await service.auth.admin.deleteUser(userId);
    },

    async setAuthRole(userId, role: StaffRole) {
      await service.auth.admin.updateUserById(userId, { app_metadata: { role } });
    },

    async getStaffEmail(userId) {
      const { data } = await service
        .from('profiles')
        .select('email, role, deleted_at')
        .eq('id', userId)
        .maybeSingle();
      if (!data || data.deleted_at || !['admin', 'doctor', 'receptionist'].includes(data.role)) return null;
      return (data.email as string | null) ?? null;
    },

    async sendSignInCode(email) {
      // The app signs in with an emailed 6-digit code, so the "invite" is simply that code.
      const anon = createClient(env.url, env.anonKey, NO_SESSION);
      const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      return !error;
    },

    async scrubAuthUser(userId) {
      await service.auth.admin.updateUserById(userId, {
        email: `deleted-${userId}@deleted.invalid`,
        phone: '',
        user_metadata: {},
        ban_duration: '876000h',
      });
    },

    async staffApply(actor, userId, args, event) {
      const { error } = await service.rpc('admin_staff_apply', {
        p_actor: actor,
        p_user: userId,
        p_args: args,
        p_event: event,
      });
      return toResult(error);
    },

    async deidentifyUser(actor, userId, requestId) {
      const { error } = await service.rpc('admin_deidentify_user', {
        p_actor: actor,
        p_user: userId,
        p_request: requestId,
      });
      return toResult(error);
    },

    async getDeletionRequest(requestId) {
      const { data } = await service
        .from('data_requests')
        .select('id, user_id, kind, status')
        .eq('id', requestId)
        .maybeSingle();
      return data ?? null;
    },
  };
}
