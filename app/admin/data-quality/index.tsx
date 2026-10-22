import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card, InfoBanner, ListItem, Screen, StatusChip, type Tone } from '@/components';
import { QueryBoundary } from '@/features/admin/components/QueryBoundary';
import { DQ_ICON, mergeCounts, type DqSeverity } from '@/features/admin/data-quality';
import { useDqCounts } from '@/features/admin/hooks';

const TONE: Record<DqSeverity, Tone> = { high: 'danger', medium: 'warning', low: 'info' };

/** Data quality center (PLAN.md §7.6 #4): one row per rule, tap to see the items to fix. */
export default function DataQuality() {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const query = useDqCounts();

  return (
    <Screen
      edges={[]}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      title={t('dq.title')}
      subtitle={t('dq.subtitle')}
    >
      <Stack.Screen options={{ title: t('dq.title') }} />
      <QueryBoundary query={query}>
        {(rows) => {
          const counts = mergeCounts(rows);
          const total = counts.reduce((sum, c) => sum + c.count, 0);
          return (
            <>
              {total === 0 ? (
                <InfoBanner tone="success" icon="check-circle-outline" message={t('dq.allClear')} />
              ) : (
                <InfoBanner tone="warning" message={t('dq.total', { count: total })} />
              )}
              <Card>
                {counts.map((c) => (
                  <ListItem
                    key={c.rule}
                    icon={DQ_ICON[c.rule]}
                    title={t(`dq.rules.${c.rule}.title`)}
                    description={t(`dq.rules.${c.rule}.hint`)}
                    right={
                      <StatusChip
                        label={c.count === 0 ? t('dq.clear') : String(c.count)}
                        tone={c.count === 0 ? 'success' : TONE[c.severity]}
                      />
                    }
                    onPress={c.count > 0 ? () => router.push(`/admin/data-quality/${c.rule}` as never) : undefined}
                  />
                ))}
              </Card>
            </>
          );
        }}
      </QueryBoundary>
    </Screen>
  );
}
