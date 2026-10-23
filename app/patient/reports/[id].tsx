import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Card,
  EmptyState,
  ListItem,
  palette,
  QueryBoundary,
  Screen,
  SectionHeader,
  spacing,
  StatusChip,
} from '@/components';
import { FileViewer } from '@/features/patient/components/FileViewer';
import { InlineError, InlineLoading } from '@/features/patient/components/Inline';
import { PatientGate } from '@/features/patient/components/PatientGate';
import { formatDateLong } from '@/features/patient/dates';
import {
  useLabTests,
  usePublishedSummaries,
  usePullToRefresh,
  useReport,
  useReportFiles,
  useReportLabResults,
} from '@/features/patient/hooks';
import { isDoctorReviewed, labFlag, referenceRange, reportDay } from '@/features/patient/reports';
import { parseSummary } from '@/features/patient/summary';
import type { LabFlag } from '@/features/patient/reports';

const FLAG_TONE = {
  low: 'warning',
  high: 'warning',
  abnormal: 'danger',
  normal: 'success',
} as const;

function LabValues({ reportId }: { reportId: string }) {
  const { t } = useTranslation('patient');
  const labs = useReportLabResults(reportId);
  const tests = useLabTests();
  return (
    <>
      <SectionHeader title={t('reports.values')} />
      <QueryBoundary
        query={labs}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <Card>
            <Text variant="bodyMedium" style={styles.muted}>
              {t('reports.noValues')}
            </Text>
          </Card>
        }
      >
        {(rows) => (
          <Card>
            {rows.map((r) => {
              const flag: LabFlag | null = labFlag(r);
              const range = referenceRange(r);
              const name =
                tests.data?.find((x) => x.code === r.test_code)?.name ??
                r.raw_name ??
                r.test_code ??
                '';
              const value = r.value_num != null ? String(r.value_num) : (r.value_text ?? '');
              return (
                <ListItem
                  key={r.id}
                  title={name}
                  description={[
                    [value, r.unit].filter(Boolean).join(' '),
                    range
                      ? t(`reports.range.${range.kind}`, { low: range.low, high: range.high })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={
                    flag ? (
                      <StatusChip label={t(`reports.flag.${flag}`)} tone={FLAG_TONE[flag]} />
                    ) : undefined
                  }
                />
              );
            })}
          </Card>
        )}
      </QueryBoundary>
    </>
  );
}

function OriginalFiles({ reportId }: { reportId: string }) {
  const { t } = useTranslation('patient');
  const files = useReportFiles(reportId);
  if (files.isError) return <InlineError onRetry={() => void files.refetch()} />;
  if (!files.data) return <InlineLoading />;
  if (files.data.length === 0) return null;
  return (
    <>
      <SectionHeader title={t('reports.original')} />
      <View style={styles.stack}>
        {files.data.map((f, i) => (
          <FileViewer key={f.id} file={f} index={i} total={files.data.length} />
        ))}
      </View>
    </>
  );
}

function ReportDetail({ id }: { id: string }) {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const report = useReport(id);
  const summaries = usePublishedSummaries();
  return (
    <QueryBoundary query={report} loadingMessage={t('reports.loading')}>
      {(r) => {
        const linked = summaries.data?.find(
          (s) => s.source_type === 'report' && s.source_id === r.id,
        );
        const parsed = linked ? parseSummary(linked.final) : null;
        return (
          <>
            <Card
              variant="soft"
              title={r.title || t(`reportTypes.${r.type}`)}
              subtitle={[t(`reportTypes.${r.type}`), r.lab_name].filter(Boolean).join(' · ')}
              right={
                isDoctorReviewed(r, summaries.data ?? []) ? (
                  <StatusChip label={t('reports.doctorReviewed')} tone="success" />
                ) : undefined
              }
            >
              <Text variant="bodyMedium" style={styles.muted}>
                {formatDateLong(reportDay(r))}
              </Text>
            </Card>

            {r.doctor_comment ? (
              <Card title={t('reports.doctorNote')}>
                <Text variant="bodyMedium" style={styles.body}>
                  {r.doctor_comment}
                </Text>
              </Card>
            ) : null}

            {linked && parsed ? (
              <Card
                title={t('reports.summaryOfReport')}
                onPress={() => router.push(`/patient/reports/summaries/${linked.id}`)}
              >
                <Text variant="bodyLarge" style={styles.body}>
                  {parsed.headline}
                </Text>
                <Text variant="labelLarge" style={styles.link}>
                  {t('reports.readSummary')}
                </Text>
              </Card>
            ) : null}

            <LabValues reportId={r.id} />
            <OriginalFiles reportId={r.id} />
          </>
        );
      }}
    </QueryBoundary>
  );
}

// Report detail (PLAN.md §7.2 #5): checked values, the doctor's summary and the original file.
export default function ReportScreen() {
  const { t } = useTranslation('patient');
  const { id } = useLocalSearchParams<{ id: string }>();
  // Blocks screenshots and the recent-apps preview while a report is open (PLAN.md §12).
  usePreventScreenCapture();
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>
        {() => (id ? <ReportDetail id={id} /> : <EmptyState title={t('reports.notFound')} />)}
      </PatientGate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
  link: { color: palette.rose, fontWeight: '700' },
});
