// Push delivery behind an interface: MockPushSender (default, no network) and ExpoPushSender
// (Expo Push API). Chosen by env PUSH_PROVIDER=mock|expo.

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { notification_id: string; route?: string };
  sound: 'default';
  channelId: 'default';
}

export type PushTicket = { status: 'ok' } | { status: 'error'; error: string };

export interface PushSender {
  readonly name: string;
  /** One ticket per message, same order. */
  send(messages: PushMessage[]): Promise<PushTicket[]>;
}

/** Records messages; a token containing "Dead" answers DeviceNotRegistered (for tests / local). */
export class MockPushSender implements PushSender {
  readonly name = 'mock';
  readonly sent: PushMessage[] = [];

  send(messages: PushMessage[]): Promise<PushTicket[]> {
    this.sent.push(...messages);
    return Promise.resolve(
      messages.map((m): PushTicket => (m.to.includes('Dead') ? { status: 'error', error: 'DeviceNotRegistered' } : { status: 'ok' })),
    );
  }
}

export class ExpoPushSender implements PushSender {
  readonly name = 'expo';
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const res = await this.fetchFn('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) throw new Error(`expo http ${res.status}`);
    const json = (await res.json()) as { data?: { status: string; details?: { error?: string }; message?: string }[] };
    const tickets = json.data ?? [];
    return messages.map((_, i): PushTicket => {
      const t = tickets[i];
      if (t?.status === 'ok') return { status: 'ok' };
      return { status: 'error', error: t?.details?.error ?? 'UnknownError' };
    });
  }
}

export function createPushSender(get: (name: string) => string | undefined): PushSender {
  return (get('PUSH_PROVIDER') ?? 'mock').toLowerCase() === 'expo' ? new ExpoPushSender() : new MockPushSender();
}

// Lock-screen text is generic by design (PLAN.md §11 "Push payload rule"): it says THAT something
// happened, never WHAT. The notification row's own title/body are only shown inside the app.
const TEXT: Record<string, string> = {
  appointment_booked: 'your appointment has an update',
  appointment_changed: 'your appointment has an update',
  appointment_cancelled: 'your appointment has an update',
  appointment_reminder: 'you have an appointment coming up',
  consultation_published: 'your visit notes are ready',
  summary_published: 'your report summary is ready',
  report_added: 'a new report was added',
  account_verified: 'your account is verified',
  visit_due: 'it is time to book your next visit',
  companion_request: 'you have a new request',
  companion_approved: 'your request has an answer',
  companion_revoked: 'your access has changed',
  week_update: 'see what is new this week',
  trimester_change: 'see what is new this week',
  ai_draft_ready: 'a draft is ready for review',
  patient_checked_in: 'a patient has arrived',
  care_team_changed: 'your care team has changed',
  data_quality: 'some items need your attention',
};

export function pushText(type: string): { title: string; body: string } {
  return { title: 'GARBH', body: `New update from GARBH: ${TEXT[type] ?? 'you have a new notification'}` };
}

/** Only in-app paths are passed through, so a crafted row cannot make a tap open a web page. */
export function safeRoute(data: unknown): string | undefined {
  const route = (data as { route?: unknown } | null)?.route;
  return typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') ? route : undefined;
}
