import { useSession } from '@/lib/session';

import { signOut } from '../session-bootstrap';

const calls: string[] = [];

jest.mock('@/lib/push', () => ({
  unregisterPushToken: jest.fn(async () => {
    calls.push('unregister');
  }),
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: jest.fn(async () => {
        calls.push('signOut');
        return { error: null };
      }),
    },
  },
}));

describe('signOut', () => {
  it('removes this device push token while the session is still valid, then signs out', async () => {
    useSession.setState({ status: 'signedIn' });
    await signOut();
    expect(calls).toEqual(['unregister', 'signOut']);
    expect(useSession.getState().status).toBe('signedOut');
  });
});
