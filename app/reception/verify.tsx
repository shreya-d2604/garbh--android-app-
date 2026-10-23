import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Card, InfoBanner, Screen, StatusChip, palette } from '@/components';
import { QueryState } from '@/features/reception/components/QueryState';
import { formatISODay } from '@/features/reception/format';
import { useRefetchOnFocus, useVerifyQueue } from '@/features/reception/hooks';
import { localDateOf } from '@/features/reception/calendar';

/** Verify queue (PLAN.md §7.5 #2): self-registered patients, today's arrivals first. */
export default function VerifyQueue() {
  const { t } = useTranslation('reception');
  const router = useRouter();
  const queue = useVerifyQueue();
  useRefetchOnFocus(queue.refetch);

  return (
    <Screen
      edges={[]}
      title={t('verify.title')}
      subtitle={t('verify.subtitle')}
      refreshing={queue.isRefetching}
      onRefresh={() => void queue.refetch()}
    >
      <InfoBanner message={t('verify.idHint')} icon="card-account-details-outline" />
      <QueryState
        isPending={queue.isPending}
        isError={queue.isError}
        onRetry={() => void queue.refetch()}
        isEmpty={(queue.data ?? []).length === 0}
        emptyIcon="check-circle-outline"
        emptyTitle={t('verify.emptyTitle')}
        emptyMessage={t('verify.emptyMessage')}
      >
        {(queue.data ?? []).map((p) => (
          <Card
            key={p.id}
            title={p.full_name}
            subtitle={[p.phone, p.dob].filter(Boolean).join(' · ')}
            right={
              p.arrivesToday ? (
                <StatusChip label={t('verify.arrivesToday')} tone="success" />
              ) : undefined
            }
            onPress={() =>
              router.push({ pathname: '/reception/verify-patient', params: { id: p.id } })
            }
            accessibilityLabel={t('verify.open', { name: p.full_name })}
          >
            <Text variant="bodySmall" style={styles.muted}>
              {t('verify.registered', { date: formatISODay(localDateOf(p.created_at)) })}
            </Text>
          </Card>
        ))}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({ muted: { color: palette.inkMuted } });
