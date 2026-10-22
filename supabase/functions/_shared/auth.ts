// Caller authentication for the AI functions (PLAN.md §8.2): the JWT user must be a doctor on the
// pregnancy's active care team. The check is done by the database (public.on_care_team, which
// reads auth.uid() from the caller's own JWT), so it cannot drift from RLS.
import { createClient } from './deps.ts';

export interface Caller {
  id: string;
  /** True only for an active doctor on the pregnancy's care team (primary or backup). */
  onCareTeam(pregnancyId: string): Promise<boolean>;
  /** Counts one AI call against the caller's hourly quota. */
  consumeQuota(fn: string): Promise<'ok' | 'rate_limited'>;
}

/** Resolves the caller from the request, or null when the JWT is missing/invalid. */
export type Authenticate = (req: Request) => Promise<Caller | null>;

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
}

export function readSupabaseEnv(get: (name: string) => string | undefined): SupabaseEnv {
  const url = get('SUPABASE_URL');
  const anonKey = get('SUPABASE_ANON_KEY');
  const serviceKey = get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) throw new Error('SUPABASE_ENV_MISSING');
  return { url, anonKey, serviceKey };
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m?.[1] ?? null;
}

export function supabaseAuthenticate(env: SupabaseEnv): Authenticate {
  return async (req) => {
    const token = bearerToken(req);
    if (!token) return null;
    const client = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      id: data.user.id,
      async onCareTeam(pregnancyId) {
        const { data: ok, error: err } = await client.rpc('on_care_team', { p_pregnancy: pregnancyId });
        if (err) throw new Error('ON_CARE_TEAM_CHECK_FAILED');
        return ok === true;
      },
      async consumeQuota(fn) {
        const { error: err } = await client.rpc('consume_ai_quota', { p_fn: fn });
        if (!err) return 'ok';
        if (err.message === 'RATE_LIMITED') return 'rate_limited';
        throw new Error('QUOTA_CHECK_FAILED');
      },
    };
  };
}
