// send-push: called by Postgres (pg_net) with the service-role key as bearer. Sends a generic
// push for one notification and prunes tokens Expo reports as dead (DeviceNotRegistered).
import { fail, json, preflight, readJson } from '../_shared/http.ts';
import { uuidSchema } from '../_shared/schemas.ts';
import { pushText, safeRoute, type PushMessage, type PushSender } from './push.ts';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  data: unknown;
  push_sent_at: string | null;
}

export interface PushRepo {
  getNotification(id: string): Promise<NotificationRow | null>;
  tokensFor(userId: string): Promise<{ id: string; expo_push_token: string }[]>;
  deleteTokens(ids: string[]): Promise<void>;
  markSent(id: string): Promise<void>;
  markError(id: string, error: string): Promise<void>;
}

export interface PushRuntime {
  serviceKey: string;
  repo: PushRepo;
  sender: PushSender;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleSendPush(req: Request, rt: PushRuntime): Promise<Response> {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('INVALID_INPUT');

  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1] ?? '';
  if (!rt.serviceKey || !safeEqual(token, rt.serviceKey)) return fail('NOT_AUTHENTICATED');

  const body = await readJson(req);
  const id = uuidSchema.safeParse(body?.notification_id);
  if (!id.success) return fail('INVALID_INPUT');

  try {
    const n = await rt.repo.getNotification(id.data);
    // Deleted in the same transaction (e.g. a reschedule replaced it) or already pushed.
    if (!n || n.push_sent_at) return json(200, { sent: 0 });

    const tokens = await rt.repo.tokensFor(n.user_id);
    if (tokens.length === 0) return json(200, { sent: 0 });

    const text = pushText(n.type);
    const route = safeRoute(n.data);
    const messages: PushMessage[] = tokens.map((t) => ({
      to: t.expo_push_token,
      ...text,
      data: { notification_id: n.id, ...(route ? { route } : {}) },
      sound: 'default',
      channelId: 'default',
    }));

    let tickets;
    try {
      tickets = await rt.sender.send(messages);
    } catch {
      await rt.repo.markError(n.id, 'SEND_FAILED');
      return json(502, { error: 'PUSH_FAILED' });
    }

    const dead = tokens.filter((_, i) => {
      const t = tickets[i];
      return t?.status === 'error' && t.error === 'DeviceNotRegistered';
    });
    if (dead.length) await rt.repo.deleteTokens(dead.map((t) => t.id));

    const sent = tickets.filter((t) => t.status === 'ok').length;
    if (sent > 0) {
      await rt.repo.markSent(n.id);
    } else {
      const errors = [...new Set(tickets.flatMap((t) => (t.status === 'error' ? [t.error] : [])))];
      await rt.repo.markError(n.id, errors.join(',').slice(0, 200) || 'NO_TICKET');
    }
    return json(200, { sent });
  } catch {
    return fail('INTERNAL');
  }
}
