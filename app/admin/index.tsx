import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, InfoBanner, ListItem, Screen, SectionHeader, StatusChip } from '@/components';
import { shapeMetrics, type DashboardView } from '@/features/admin/format';
import { useDashboard } from '@/features/admin/hooks';
import { QueryBoundary } from '@/features/admin/components/QueryBoundary';
import { StatTile } from '@/features/admin/components/StatTile';
import { useSession } from '@/lib/session';

const ATTENTION_ICON = {
  openIssues: 'shield-alert-outline',
  unverifiedPatients: 'account-clock-outline',
  aiPending: 'robot-outline',
  unverifiedValues: 'flask-outline',
  missedVisits: 'calendar-remove-outline',
} as const;

/** Admin dashboard (PLAN.md §7.6 #1). */
export default function Dashboard() {
  const { t } = useTranslation('admin');
  const name = useSession((s) => s.profile?.full_name) ?? '';
  const query = useDashboard();

  return (
    <Screen
      edges={[]}
      title={t('dashboard.hello', { name })}
      subtitle={t('dashboard.subtitle')}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <QueryBoundary query={query}>{(row) => <Body view={shapeMetrics(row)} />}</QueryBoundary>
    </Screen>
  );
}

function Body({ view }: { view: DashboardView }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  return (
    <>
      <Card title={t('dashboard.pregnancies')} subtitle={t('dashboard.pregnanciesHint')}>
        <View style={styles.row}>
          <StatTile value={view.activePregnancies} label={t('dashboard.active')} />
          <StatTile
            value={view.highRisk}
            label={t('dashboard.highRisk')}
            tone={view.highRisk > 0 ? 'danger' : 'default'}
          />
        </View>
        <View style={styles.row}>
          {view.trimesters.map((tri) => (
            <StatTile
              key={tri.trimester}
              value={tri.count}
              label={t('dashboard.trimester', { n: tri.trimester })}
            />
          ))}
        </View>
        {view.undated > 0 ? (
          <InfoBanner tone="warning" message={t('dashboard.undated', { count: view.undated })} />
        ) : null}
      </Card>

      <Card title={t('dashboard.appointments')}>
        <View style={styles.row}>
          <StatTile value={view.appointmentsToday} label={t('dashboard.today')} />
          <StatTile value={view.appointmentsWeek} label={t('dashboard.thisWeek')} />
          <StatTile
            value={view.noShow.percent ?? '-'}
            label={t('dashboard.noShow', { count: view.noShow.sample })}
          />
        </View>
      </Card>

      <SectionHeader title={t('dashboard.attention')} />
      {view.allClear ? (
        <InfoBanner tone="success" icon="check-circle-outline" message={t('dashboard.allClear')} />
      ) : (
        <Card>
          {view.attention.map((item) => (
            <ListItem
              key={item.key}
              icon={ATTENTION_ICON[item.key]}
              title={t(`dashboard.items.${item.key}`)}
              right={
                <StatusChip
                  label={String(item.count)}
                  tone={
                    item.count === 0 ? 'neutral' : item.key === 'openIssues' ? 'danger' : 'warning'
                  }
                />
              }
              onPress={item.route ? () => router.push(item.route as never) : undefined}
            />
          ))}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
