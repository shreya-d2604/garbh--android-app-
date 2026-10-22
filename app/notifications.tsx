import { Stack, useRouter } from 'expo-router';
import { FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  EmptyState,
  ErrorState,
  InfoBanner,
  LoadingState,
  Screen,
  spacing,
} from '@/components';
import type { NotificationRow } from '@/features/notifications/api';
import { internalRoute } from '@/features/notifications/format';
import { useMarkAllRead, useMarkRead, useNotifications } from '@/features/notifications/hooks';
import { NotificationCard } from '@/features/notifications/NotificationCard';

/** Notification inbox (PLAN.md §7.1): live, newest first, tap = mark read + open the deep link. */
export default function Notifications() {
  const { t } = useTranslation('backend');
  const router = useRouter();
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const unread = (data ?? []).filter((n) => !n.read_at).length;

  const open = (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate(n.id);
    const route = internalRoute(n.data);
    if (route) router.push(route as never);
  };

  return (
    <Screen scroll={false} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('notifications.title') }} />
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon="bell-outline"
          title={t('notifications.emptyTitle')}
          message={t('notifications.emptyMessage')}
        />
      ) : (
        <>
          {markRead.isError || markAllRead.isError ? (
            <InfoBanner tone="danger" message={t('notifications.markFailed')} />
          ) : null}
          {unread > 0 ? (
            <Button
              label={t('notifications.markAllRead')}
              variant="text"
              fullWidth={false}
              loading={markAllRead.isPending}
              onPress={() => markAllRead.mutate()}
            />
          ) : null}
          <FlatList
            data={data}
            keyExtractor={(n) => n.id}
            contentContainerStyle={styles.list}
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            renderItem={({ item }) => <NotificationCard item={item} onPress={open} />}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingBottom: spacing.lg },
});
