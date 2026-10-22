import { fetchNotifications, fetchUnreadCount, INBOX_LIMIT, markAllRead, markRead } from '../api';

// Chainable fake of the PostgREST query mockBuilder that records every call.
const mockCalls: [string, unknown[]][] = [];
let mockResult: { data?: unknown; count?: number | null; error: unknown } = {
  data: [],
  error: null,
};

function mockBuilder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'update', 'eq', 'is', 'order', 'limit']) {
    b[m] = (...args: unknown[]) => {
      mockCalls.push([m, args]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => void) => resolve(mockResult);
  return b;
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockCalls.push(['from', [table]]);
      return mockBuilder();
    },
  },
}));

beforeEach(() => {
  mockCalls.length = 0;
  mockResult = { data: [], error: null };
});

describe('notifications api', () => {
  it("reads only the caller's rows, newest first (admin could otherwise read everyone's)", async () => {
    mockResult = { data: [{ id: 'n1' }], error: null };
    await expect(fetchNotifications('u1')).resolves.toEqual([{ id: 'n1' }]);
    expect(mockCalls).toEqual([
      ['from', ['notifications']],
      ['select', ['*']],
      ['eq', ['user_id', 'u1']],
      ['order', ['created_at', { ascending: false }]],
      ['limit', [INBOX_LIMIT]],
    ]);
  });

  it('counts unread rows without fetching them', async () => {
    mockResult = { count: 3, error: null };
    await expect(fetchUnreadCount('u1')).resolves.toBe(3);
    expect(mockCalls).toContainEqual(['select', ['id', { count: 'exact', head: true }]]);
    expect(mockCalls).toContainEqual(['is', ['read_at', null]]);
    mockResult = { count: null, error: null };
    await expect(fetchUnreadCount('u1')).resolves.toBe(0);
  });

  it('marks one notification read: only read_at, only own, only if unread', async () => {
    await markRead('u1', 'n1');
    const update = mockCalls.find(([m]) => m === 'update');
    expect(Object.keys((update?.[1][0] as object) ?? {})).toEqual(['read_at']);
    expect(mockCalls).toContainEqual(['eq', ['id', 'n1']]);
    expect(mockCalls).toContainEqual(['eq', ['user_id', 'u1']]);
    expect(mockCalls).toContainEqual(['is', ['read_at', null]]);
  });

  it('marks everything read for the caller only', async () => {
    await markAllRead('u1');
    expect(mockCalls).toContainEqual(['eq', ['user_id', 'u1']]);
    expect(mockCalls).toContainEqual(['is', ['read_at', null]]);
  });

  it('throws on a database error', async () => {
    mockResult = { data: null, error: new Error('boom') };
    await expect(fetchNotifications('u1')).rejects.toThrow('boom');
    await expect(markRead('u1', 'n1')).rejects.toThrow('boom');
    await expect(markAllRead('u1')).rejects.toThrow('boom');
    await expect(fetchUnreadCount('u1')).rejects.toThrow('boom');
  });
});
