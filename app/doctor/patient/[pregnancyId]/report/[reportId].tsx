import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InfoBanner,
  LoadingState,
  Screen,
  spacing,
  StatusChip,
} from '@/components';
import { functionErrorKey } from '@/features/doctor/ai-review';
import { ErrorBanner } from '@/features/doctor/components/ErrorBanner';
import { LabValuesList } from '@/features/doctor/components/labs/LabValuesList';
import { ReportPageView } from '@/features/doctor/components/ReportPageView';
import { useReportActions, useReportDetail, useSummaryFunction } from '@/features/doctor/hooks';
import { useSecureScreen } from '@/features/doctor/use-secure-screen';

/** Report detail: pages, lab values (manual entry / verify), comment, AI extraction, remove. */
export default function ReportDetailScreen() {
  const { pregnancyId, reportId } = useLocalSearchParams<{
    pregnancyId: string;
    reportId: string;
  }>();
  const { t } = useTranslation('doctor');
  const router = useRouter();
  useSecureScreen('doctor-report');
  const detail = useReportDetail(reportId);
  const actions = useReportActions(reportId, pregnancyId);
  const ai = useSummaryFunction(pregnancyId);
  const [comment, setComment] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ tone: 'success' | 'danger'; key: string } | null>(
    null,
  );

  if (detail.isPending)
    return (
      <Screen edges={['bottom']}>
        <LoadingState />
      </Screen>
    );
  if (detail.isError)
    return (
      <Screen edges={['bottom']}>
        <ErrorState onRetry={() => void detail.refetch()} />
      </Screen>
    );
  if (!detail.data) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="file-question-outline"
          title={t('report.notFoundTitle')}
          message={t('report.notFoundMessage')}
        />
      </Screen>
    );
  }
  const { report, files, results, tests, summaryId } = detail.data;
  const canExtract =
    report.extraction_status !== 'processing' && report.extraction_status !== 'done';

  const extract = () => {
    setAiMessage(null);
    ai.mutate(
      { name: 'process-report', body: { report_id: reportId } },
      {
        onSuccess: (res) =>
          setAiMessage(
            res.ok
              ? { tone: 'success', key: 'ai.started' }
              : { tone: 'danger', key: functionErrorKey(res.code) },
          ),
      },
    );
  };

  return (
    <Screen
      edges={['bottom']}
      title={report.title ?? t(`report.type.${report.type}`)}
      subtitle={[
        t(`report.type.${report.type}`),
        report.report_date
          ? format(new Date(`${report.report_date}T00:00:00`), 'd MMM yyyy')
          : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      refreshing={detail.isRefetching}
      onRefresh={() => void detail.refetch()}
    >
      <Card
        title={t('report.extraction')}
        right={
          <StatusChip
            label={t(`reports.extraction.${report.extraction_status}`)}
            tone={
              report.extraction_status === 'failed'
                ? 'danger'
                : report.extraction_status === 'done'
                  ? 'success'
                  : 'neutral'
            }
          />
        }
      >
        {report.extraction_status === 'failed' && report.extraction_error ? (
          <InfoBanner tone="warning" message={t('report.extractionFailed')} />
        ) : null}
        {aiMessage ? <InfoBanner tone={aiMessage.tone} message={t(aiMessage.key)} /> : null}
        {canExtract ? (
          <Button label={t('report.extract')} loading={ai.isPending} onPress={extract} />
        ) : null}
        {summaryId ? (
          <Button
            label={t('report.openSummary')}
            variant="secondary"
            onPress={() => router.push(`/doctor/ai-inbox/${summaryId}`)}
          />
        ) : null}
      </Card>

      <Card title={t('report.pages')}>
        {files.length === 0 ? (
          <InfoBanner tone="info" message={t('report.noFiles')} />
        ) : (
          files.map((f) => <ReportPageView key={f.id} file={f} />)
        )}
      </Card>

      <LabValuesList
        reportId={reportId}
        pregnancyId={pregnancyId}
        results={results}
        tests={tests}
        observedOn={report.report_date}
      />

      <Card title={t('report.comment')}>
        <TextInput
          mode="outlined"
          multiline
          label={t('report.comment')}
          value={comment ?? report.doctor_comment ?? ''}
          onChangeText={setComment}
          accessibilityLabel={t('report.comment')}
        />
        <ErrorBanner error={actions.comment.error} />
        <Button
          label={t('common:actions.save')}
          variant="secondary"
          disabled={comment === null}
          loading={actions.comment.isPending}
          onPress={() =>
            comment !== null &&
            actions.comment.mutate(comment, { onSuccess: () => setComment(null) })
          }
        />
      </Card>

      <ErrorBanner error={actions.remove.error} />
      <Button
        label={t('report.removeReport')}
        variant="danger"
        style={styles.remove}
        onPress={() => setRemoving(true)}
      />
      <ConfirmDialog
        visible={removing}
        title={t('report.removeTitle')}
        message={t('report.removeMessage')}
        confirmLabel={t('report.removeReport')}
        danger
        loading={actions.remove.isPending}
        onDismiss={() => setRemoving(false)}
        onConfirm={() =>
          actions.remove.mutate(undefined, {
            onSuccess: () => router.back(),
            onSettled: () => setRemoving(false),
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ remove: { marginTop: spacing.md } });
