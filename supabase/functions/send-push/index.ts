import { createClient } from '../_shared/deps.ts';
import { handleSendPush, type PushRepo, type PushRuntime } from './handler.ts';
import { createPushSender } from './push.ts';

let cached: PushRuntime | undefined;

function runtime(): PushRuntime {
  if (!cached) {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) throw new Error('SUPABASE_ENV_MISSING');
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const repo: PushRepo = {
      async getNotification(id) {
        const { data, error } = await db.from('notifications').select('id, user_id, type, data, push_sent_at').eq('id', id).maybeSingle();
        if (error) throw new Error('DB_NOTIFICATION');
        return data;
      },
      async tokensFor(userId) {
        const { data, error } = await db.from('push_tokens').select('id, expo_push_token').eq('user_id', userId);
        if (error) throw new Error('DB_TOKENS');
        return data ?? [];
      },
      async deleteTokens(ids) {
        const { error } = await db.from('push_tokens').delete().in('id', ids);
        if (error) throw new Error('DB_TOKEN_DELETE');
      },
      async markSent(id) {
        const { error } = await db.from('notifications').update({ push_sent_at: new Date().toISOString(), push_error: null }).eq('id', id);
        if (error) throw new Error('DB_MARK_SENT');
      },
      async markError(id, message) {
        const { error } = await db.from('notifications').update({ push_error: message }).eq('id', id);
        if (error) throw new Error('DB_MARK_ERROR');
      },
    };
    cached = { serviceKey, repo, sender: createPushSender((n) => Deno.env.get(n)) };
  }
  return cached;
}

Deno.serve((req) => handleSendPush(req, runtime()));
