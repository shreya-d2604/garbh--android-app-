// Real Supabase wiring for handler.ts. The client factory is injected (see admin-users/port.ts).
// The service-role key stays inside the Edge Function runtime.
import type { ExportPort } from './handler.ts';

// deno-lint-ignore no-explicit-any
type Client = any;
export type CreateClient = (url: string, key: string, options?: Record<string, unknown>) => Client;

export interface Env {
  url: string;
  anonKey: string;
  serviceKey: string;
}

const NO_SESSION = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const KNOWN = ['NOT_ALLOWED', 'NOT_FOUND', 'INVALID_INPUT', 'NOT_AUTHENTICATED'];

export function createPort(createClient: CreateClient, env: Env): ExportPort {
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

    async exportData(actor, subject) {
      const { data, error } = await service.rpc('admin_export_patient_data', {
        p_actor: actor,
        p_patient: subject.patientId ?? null,
        p_user: subject.userId ?? null,
      });
      if (error) {
        return {
          ok: false,
          code: KNOWN.includes(error.message ?? '') ? (error.message as string) : 'GENERIC',
        };
      }
      return { ok: true, data };
    },
  };
}
