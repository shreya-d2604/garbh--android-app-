import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet } from 'react-native';

import { Card, EmptyState, InfoBanner, Screen, StatusChip, spacing, type Tone } from '@/components';
import { QueryBoundary } from '@/features/admin/components/QueryBoundary';
import { firstParam } from '@/features/admin/components/ui';
import {
  dqDetailParams,
  dqFixRoute,
  isDqRule,
  toIssue,
  type DqIssue,
  type DqRule,
  type DqSeverity,
} from '@/features/admin/data-quality';
import { formatWhen } from '@/features/admin/format';
import { useDqIssues } from '@/features/admin/hooks';

const TONE: Record<DqSeverity, Tone> = { high: 'danger', medium: 'warning', low: 'info' };

/** Every item that breaks one rule. Tapping an item opens the screen where it can be fixed. */
export default function DataQualityRule() {
  const { t } = useTranslation('admin');
  const rule = firstParam(useLocalSearchParams<{ rule: string }>().rule);
  if (!isDqRule(rule)) {
    return (
      <Screen edges={[]}>
        <EmptyState title={t('dq.unknownRule')} icon="help-circle-outline" />
      </Screen>
    );
  }
  return <RuleList rule={rule} />;
}

function RuleList({ rule }: { rule: DqRule }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const query = useDqIssues(rule);
  return (
    <Screen scroll={false} edges={[]} contentStyle={styles.screen}>
      <Stack.Screen options={{ title: t(`dq.rules.${rule}.title`) }} />
      <InfoBanner message={t(`dq.rules.${rule}.hint`)} />
      <QueryBoundary
        query={query}
        isEmpty={(rows) => rows.length === 0}
        empty={{ title: t('dq.noneLeft'), message: t('dq.noneLeftHint'), icon: 'check-circle-outline' }}
      >
        {(rows) => (
          <FlatList
            data={rows.map(toIssue).filter((i): i is DqIssue => i !== null)}
            keyExtractor={(i, index) => `${i.entityId ?? i.patientId ?? 'x'}-${index}`}
            contentContainerStyle={styles.items}
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            renderItem={({ item }) => (
              <Card
                title={item.patientName || t('dq.unnamed')}
                subtitle={[t(`dq.rules.${rule}.detail`, dqDetailParams(item)), formatWhen(item.since)]
                  .filter(Boolean)
                  .join(' · ')}
                right={<StatusChip label={t(`dq.severity.${item.severity}`)} tone={TONE[item.severity]} />}
                onPress={() => router.push(dqFixRoute(item) as never)}
                accessibilityLabel={t('dq.openToFix', { name: item.patientName })}
              />
            )}
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm },
  items: { gap: spacing.sm, paddingBottom: spacing.lg },
});
