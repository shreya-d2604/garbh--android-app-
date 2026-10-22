// Production wiring: real Supabase clients and the provider chosen by env. Handlers never read
// the environment themselves, so tests inject fakes instead.
import { readSupabaseEnv, supabaseAuthenticate } from './auth.ts';
import { createProvider } from './gemini.ts';
import type { Runtime } from './pipeline.ts';
import { supabaseRepo } from './repo.ts';

let cached: Runtime | undefined;

export function runtime(): Runtime {
  if (!cached) {
    const get = (n: string) => Deno.env.get(n);
    const env = readSupabaseEnv(get);
    cached = {
      authenticate: supabaseAuthenticate(env),
      repo: supabaseRepo(env.url, env.serviceKey),
      provider: createProvider({ get }),
    };
  }
  return cached;
}
