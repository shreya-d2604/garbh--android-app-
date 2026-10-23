import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRealtimeInvalidate } from '@/lib/realtime';
import { useSession } from '@/lib/session';

import { fetchNotifications, fetchUnreadCount, markAllRead, markRead } from './api';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: string) => ['notifications', 'list', userId] as const,
  unread: (userId: string) => ['notifications', 'unread', userId] as const,
};

function useUserId(): string | null {
  return useSession((s) => s.profile?.id ?? null);
}

/** The signed-in user's inbox, newest first, kept live through Realtime. */
export function useNotifications() {
  const userId = useUserId();
  useRealtimeInvalidate({
    table: 'notifications',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    queryKey: notificationKeys.all,
    enabled: !!userId,
  });
  return useQuery({
    queryKey: notificationKeys.list(userId ?? ''),
    queryFn: () => fetchNotifications(userId as string),
    enabled: !!userId,
  });
}

/** Unread badge count (for headers). Live as well. */
export function useUnreadCount() {
  const userId = useUserId();
  useRealtimeInvalidate({
    table: 'notifications',
    filter: userId ? `user_id=eq.${userId}` : undefined,
    queryKey: notificationKeys.all,
    enabled: !!userId,
  });
  return useQuery({
    queryKey: notificationKeys.unread(userId ?? ''),
    queryFn: () => fetchUnreadCount(userId as string),
    enabled: !!userId,
  });
}

export function useMarkRead() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markRead(userId as string, id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllRead(userId as string),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
