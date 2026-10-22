import { renderHook } from '@testing-library/react-native';

import {
  registerForPush,
  resolveProjectId,
  routeFromResponse,
  unregisterPushToken,
  usePushRegistration,
  type PushDeps,
} from '../push';
import { useSession } from '../session';

const mockPush = jest.fn();
const mockRemove = jest.fn();
let responseListener: ((r: unknown) => void) | undefined;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } }, easConfig: null },
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[abc]' }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  addNotificationResponseReceivedListener: jest.fn((cb: (r: unknown) => void) => {
    responseListener = cb;
    return { remove: mockRemove };
  }),
}));
const mockRpc = jest.fn().mockResolvedValue({ error: null });
const mockDeleteEq = jest.fn().mockResolvedValue({ error: null });
jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => ({ delete: () => ({ eq: (...a: unknown[]) => mockDeleteEq(...a) }) }),
  },
}));

const deps = (over: Partial<PushDeps> = {}): PushDeps => ({
  isDevice: true,
  platform: 'android',
  projectId: 'proj-1',
  setChannel: jest.fn().mockResolvedValue(null),
  getPermission: jest.fn().mockResolvedValue({ granted: true, canAskAgain: true }),
  requestPermission: jest.fn().mockResolvedValue({ granted: true }),
  getToken: jest.fn().mockResolvedValue('ExponentPushToken[abc]'),
  register: jest.fn().mockResolvedValue(undefined),
  ...over,
});

describe('registerForPush', () => {
  it('registers the token when permission is already granted', async () => {
    const d = deps();
    await expect(registerForPush(d)).resolves.toBe('ExponentPushToken[abc]');
    expect(d.setChannel).toHaveBeenCalled();
    expect(d.requestPermission).not.toHaveBeenCalled();
    expect(d.getToken).toHaveBeenCalledWith('proj-1');
    expect(d.register).toHaveBeenCalledWith('ExponentPushToken[abc]', 'android');
  });

  it('asks for permission once when it can, and registers if granted', async () => {
    const d = deps({
      getPermission: jest.fn().mockResolvedValue({ granted: false, canAskAgain: true }),
    });
    await expect(registerForPush(d)).resolves.toBe('ExponentPushToken[abc]');
    expect(d.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('does nothing when permission is refused', async () => {
    const d = deps({
      getPermission: jest.fn().mockResolvedValue({ granted: false, canAskAgain: true }),
      requestPermission: jest.fn().mockResolvedValue({ granted: false }),
    });
    await expect(registerForPush(d)).resolves.toBeNull();
    expect(d.register).not.toHaveBeenCalled();
  });

  it('does not nag when the user blocked prompts', async () => {
    const d = deps({
      getPermission: jest.fn().mockResolvedValue({ granted: false, canAskAgain: false }),
    });
    await expect(registerForPush(d)).resolves.toBeNull();
    expect(d.requestPermission).not.toHaveBeenCalled();
  });

  it('skips emulators and builds without an EAS project id', async () => {
    const a = deps({ isDevice: false });
    const b = deps({ projectId: null });
    await expect(registerForPush(a)).resolves.toBeNull();
    await expect(registerForPush(b)).resolves.toBeNull();
    expect(a.getPermission).not.toHaveBeenCalled();
    expect(b.getToken).not.toHaveBeenCalled();
  });

  it('only creates the notification channel on Android', async () => {
    const d = deps({ platform: 'ios' });
    await registerForPush(d);
    expect(d.setChannel).not.toHaveBeenCalled();
  });

  it('never throws: a failing registration just means no push', async () => {
    const d = deps({ register: jest.fn().mockRejectedValue(new Error('network')) });
    await expect(registerForPush(d)).resolves.toBeNull();
  });
});

describe('helpers', () => {
  it('finds the EAS project id in either config', () => {
    expect(resolveProjectId({ expoConfig: { extra: { eas: { projectId: 'a' } } } })).toBe('a');
    expect(resolveProjectId({ expoConfig: null, easConfig: { projectId: 'b' } })).toBe('b');
    expect(resolveProjectId({})).toBeNull();
  });

  it('extracts only in-app routes from a tapped push', () => {
    const resp = (data: unknown) => ({ notification: { request: { content: { data } } } });
    expect(routeFromResponse(resp({ route: '/doctor/today' }))).toBe('/doctor/today');
    expect(routeFromResponse(resp({ route: 'https://evil.test' }))).toBeNull();
    expect(routeFromResponse(resp({}))).toBeNull();
    expect(routeFromResponse(null)).toBeNull();
  });
});

describe('usePushRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    responseListener = undefined;
    useSession.setState({ status: 'signedOut', profile: null });
  });

  it('registers once a user with a role is signed in, not before', async () => {
    await renderHook(() => usePushRegistration());
    expect(mockRpc).not.toHaveBeenCalled();
    useSession.setState({ status: 'signedIn', profile: { id: 'u1', role: null } as never });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRpc).not.toHaveBeenCalled();
    useSession.setState({ status: 'signedIn', profile: { id: 'u1', role: 'patient' } as never });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', {
      p_token: 'ExponentPushToken[abc]',
      p_platform: expect.any(String),
    });
  });

  it('opens the route of a tapped push once, and stops listening on unmount', async () => {
    useSession.setState({ status: 'signedIn', profile: { id: 'u1', role: 'doctor' } as never });
    const { unmount } = await renderHook(() => usePushRegistration());
    const tap = {
      notification: {
        request: { identifier: 'req-1', content: { data: { route: '/doctor/ai-inbox/s1' } } },
      },
    };
    responseListener?.(tap);
    responseListener?.(tap);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/doctor/ai-inbox/s1');
    await unmount();
    expect(mockRemove).toHaveBeenCalled();
  });

  it('ignores taps with an external route', async () => {
    useSession.setState({ status: 'signedIn', profile: { id: 'u1', role: 'doctor' } as never });
    await renderHook(() => usePushRegistration());
    responseListener?.({
      notification: {
        request: { identifier: 'req-2', content: { data: { route: 'https://evil.test' } } },
      },
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('unregisterPushToken', () => {
  it("deletes this device's token and never throws", async () => {
    await unregisterPushToken();
    expect(mockDeleteEq).toHaveBeenCalledWith('expo_push_token', 'ExponentPushToken[abc]');
    mockDeleteEq.mockRejectedValueOnce(new Error('offline'));
    await expect(unregisterPushToken()).resolves.toBeUndefined();
  });
});
