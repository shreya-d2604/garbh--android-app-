import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native-paper';

import {
  Button,
  Card,
  EmptyState,
  ListItem,
  Screen,
  SectionHeader,
  StatusChip,
  palette,
  spacing,
} from '@/components';
import { InlineError, InlineLoading } from '@/features/patient/components/Inline';
import { PatientGate, type ReadyContext } from '@/features/patient/components/PatientGate';
import { formatDateLong, formatStamp } from '@/features/patient/dates';
import { usePublishedSummaries, usePullToRefresh, useReports } from '@/features/patient/hooks';
import {
  groupReportsByTrimester,
  isDoctorReviewed,
  reportDay,
  REPORT_ICON,
} from '@/features/patient/reports';
import { parseSummary } from '@/features/patient/summary';

function SummariesList() {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const summaries = usePublishedSummaries();
  if (summaries.isError) return <InlineError onRetry={() => void summaries.refetch()} />;
  if (!summaries.data) return <InlineLoading />;
  if (summaries.data.length === 0) {
    return (
      <Card>
        <Text variant="bodyMedium" style={styles.muted}>
          {t('reports.noSummaries')}
        </Text>
      </Card>
    );
  }
  return (
    <Card>
      {summaries.data.map((s) => (
        <ListItem
          key={s.id}
          icon="text-box-check-outline"
          title={parseSummary(s.final)?.headline || t('summary.untitled')}
          description={`${t(`summary.source.${s.source_type}`)} · ${formatStamp(s.published_at)}`}
          onPress={() => router.push(`/patient/reports/summaries/${s.id}`)}
        />
      ))}
    </Card>
  );
}

function ReportsList({ ctx }: { ctx: ReadyContext }) {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const reports = useReports();
  const summaries = usePublishedSummaries();
  if (reports.isError) return <InlineError onRetry={() => void reports.refetch()} />;
  if (!reports.data) return <InlineLoading />;
  if (reports.data.length === 0) {
    return (
      <EmptyState
        icon="file-document-outline"
        title={t('reports.emptyTitle')}
        message={t('reports.emptyMessage')}
      />
    );
  }
  const groups = groupReportsByTrimester(reports.data, ctx.edd);
  return (
    <>
      {groups.map((g) => (
        <View key={g.trimester} style={styles.stack}>
          <Text variant="titleSmall" style={styles.group}>
            {t(
              g.trimester === 0 ? 'reports.otherReports' : `reports.trimesterGroup.${g.trimester}`,
            )}
          </Text>
          <Card>
            {g.reports.map((r) => (
              <ListItem
                key={r.id}
                icon={REPORT_ICON[r.type]}
                title={r.title || t(`reportTypes.${r.type}`)}
                description={formatDateLong(reportDay(r))}
                right={
                  isDoctorReviewed(r, summaries.data ?? []) ? (
                    <StatusChip label={t('reports.doctorReviewed')} tone="success" />
                  ) : undefined
                }
                onPress={() => router.push(`/patient/reports/${r.id}`)}
              />
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

// Reports & summaries (PLAN.md §7.2 #5).
export default function ReportsScreen() {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>
        {(ctx) => (
          <>
            <Button
              label={t('reports.seeTrends')}
              variant="secondary"
              icon="chart-line"
              onPress={() => router.push('/patient/reports/trends')}
            />
            <SectionHeader title={t('reports.summaries')} />
            <SummariesList />
            <SectionHeader title={t('reports.yourReports')} />
            <ReportsList ctx={ctx} />
          </>
        )}
      </PatientGate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  group: { color: palette.inkMuted, fontWeight: '700' },
  muted: { color: palette.inkMuted },
});
