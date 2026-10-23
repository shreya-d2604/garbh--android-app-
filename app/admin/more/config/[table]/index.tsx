import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Card, EmptyState, QueryBoundary, Screen, spacing, StatusChip } from '@/components';
import { firstParam } from '@/features/admin/components/ui';
import { CONFIG_TABLES, isConfigKey, type ConfigTable } from '@/features/admin/config';
import { useConfigRows } from '@/features/admin/hooks';

/** List of one configuration catalog (visit templates, lab tests, drugs, guidance, weeks, milestones). */
export default function ConfigList() {
  const { t } = useTranslation('admin');
  const table = firstParam(useLocalSearchParams<{ table: string }>().table);
  if (!isConfigKey(table)) {
    return (
      <Screen edges={[]}>
        <EmptyState title={t('config.unknown')} icon="help-circle-outline" />
      </Screen>
    );
  }
  return <List def={CONFIG_TABLES[table]} />;
}

function List({ def }: { def: ConfigTable }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const query = useConfigRows(def);
  const base = `/admin/more/config/${def.key}`;
  return (
    <Screen scroll={false} edges={[]} contentStyle={styles.screen}>
      <Stack.Screen options={{ title: t(`config.tables.${def.key}.title`) }} />
      <Button label={t('config.add')} onPress={() => router.push(`${base}/new` as never)} />
      <QueryBoundary
        query={query}
        isEmpty={(rows) => rows.length === 0}
        empty={{ title: t('config.empty'), message: t('config.emptyHint'), icon: 'playlist-plus' }}
      >
        {(rows) => (
          <FlatList
            data={rows}
            keyExtractor={(r) => String(r[def.pk])}
            contentContainerStyle={styles.items}
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            renderItem={({ item }) => (
              <Card
                title={def.titleOf(item)}
                subtitle={def.subtitleOf(item)}
                right={
                  def.activeKey && item[def.activeKey] === false ? (
                    <StatusChip label={t('config.inactive')} tone="neutral" />
                  ) : null
                }
                onPress={() =>
                  router.push(`${base}/${encodeURIComponent(String(item[def.pk]))}` as never)
                }
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
