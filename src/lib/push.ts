// Push notification registration (PLAN.md §8.5, §11). The head mounts `usePushRegistration()`
// once inside the router tree in app/_layout.tsx (RoleRouter).
//
// Flow: signed in with a role -> (physical device) ask for permission -> get the Expo push token
// -> register_push_token() RPC (moves the token to this user if the device changed hands).
// A tap on a push opens `data.route`, exactly like a tap in the inbox.
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { internalRoute } from '@/features/notifications/format';

import { useSession } from './session';
import { supabase } from './supabase';

const CHANNEL_ID = 'default';

type NotificationsModule = typeof import('expo-notifications');

// Expo Go on Android ships no push module, and importing expo-notifications there throws at load
// time (Metro reports that as fatal even inside a try/catch), which would stop the whole app from
// starting. So the native piece is probed first (requireOptionalNativeModule returns null instead
// of throwing) and push is simply off when it is missing; development and release builds get the
// real module.
let notificationsModule: NotificationsModule | null | undefined;
function notifications(): NotificationsModule | null {
  if (notificationsModule !== undefined) return notificationsModule;
  if (!requireOptionalNativeModule('ExpoTopicSubscriptionModule')) {
    notificationsModule = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notificationsModule = require('expo-notifications') as NotificationsModule;
    notificationsModule.setNotificationHandler({
      handleNotification: () =>
        Promise.resolve({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
    });
  } catch {
    notificationsModule = null;
  }
  return notificationsModule;
}

/** EAS project id from the app config (needed by Expo to mint a token). Null when not configured. */
export function resolveProjectId(c: {
  expoConfig?: { extra?: { eas?: { projectId?: string } } } | null;
  easConfig?: { projectId?: string } | null;
}): string | null {
  return c.expoConfig?.extra?.eas?.projectId ?? c.easConfig?.projectId ?? null;
}

export interface PushDeps {
  isDevice: boolean;
  platform: string;
  projectId: string | null;
  setChannel: () => Promise<unknown>;
  getPermission: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestPermission: () => Promise<{ granted: boolean }>;
  getToken: (projectId: string) => Promise<string>;
  register: (token: string, platform: string) => Promise<void>;
}

/**
 * Registers this device for push. Returns the token, or null when push is not possible here
 * (emulator, permission refused, no EAS project id). Never throws: push is optional and the
 * in-app inbox works without it.
 */
export async function registerForPush(d: PushDeps): Promise<string | null> {
  try {
    if (!d.isDevice || !d.projectId) return null;
    if (d.platform === 'android') await d.setChannel();
    let permission = await d.getPermission();
    if (!permission.granted && permission.canAskAgain) {
      permission = { ...permission, ...(await d.requestPermission()) };
    }
    if (!permission.granted) return null;
    const token = await d.getToken(d.projectId);
    await d.register(token, d.platform);
    return token;
  } catch {
    return null;
  }
}

const liveDeps = (n: NotificationsModule): PushDeps => ({
  isDevice: Device.isDevice,
  platform: Platform.OS,
  projectId: resolveProjectId(Constants),
  setChannel: () =>
    n.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'GARBH',
      importance: n.AndroidImportance.DEFAULT,
    }),
  getPermission: async () => {
    const p = await n.getPermissionsAsync();
    return { granted: p.granted, canAskAgain: p.canAskAgain };
  },
  requestPermission: async () => {
    const p = await n.requestPermissionsAsync();
    return { granted: p.granted };
  },
  getToken: async (projectId) => (await n.getExpoPushTokenAsync({ projectId })).data,
  register: async (token, platform) => {
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: platform,
    });
    if (error) throw error;
  },
});

/**
 * Call before signing out so this device stops receiving the previous user's notifications.
 * Best effort: failures are swallowed (the next user to sign in takes the token over anyway).
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const n = notifications();
    if (!n) return;
    const d = liveDeps(n);
    if (!d.isDevice || !d.projectId) return;
    const token = await d.getToken(d.projectId);
    await supabase.from('push_tokens').delete().eq('expo_push_token', token);
  } catch {
    /* nothing to clean up */
  }
}

/** Route carried by a tapped notification (`data.route`), or null. */
export function routeFromResponse(
  response: { notification: { request: { content: { data?: unknown } } } } | null | undefined,
): string | null {
  return internalRoute(response?.notification.request.content.data);
}

/** Registers for push while a user with a role is signed in, and opens routes from push taps. */
export function usePushRegistration(): void {
  const router = useRouter();
  const status = useSession((s) => s.status);
  const userId = useSession((s) => s.profile?.id ?? null);
  const role = useSession((s) => s.profile?.role ?? null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'signedIn' || !userId || !role) return;
    const n = notifications();
    if (!n) return;
    void registerForPush(liveDeps(n));
  }, [status, userId, role]);

  useEffect(() => {
    const n = notifications();
    if (status !== 'signedIn' || !n) return;
    const open = (
      response: Parameters<typeof routeFromResponse>[0] & {
        notification: { request: { identifier: string } };
      },
    ) => {
      const route = routeFromResponse(response);
      const id = response.notification.request.identifier;
      if (!route || handled.current === id) return;
      handled.current = id;
      router.push(route as never);
    };
    // Cold start: the app was opened by tapping a push.
    void n.getLastNotificationResponseAsync().then((r) => {
      if (r) open(r);
    });
    const sub = n.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [status, router]);
}
