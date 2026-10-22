import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  DateField,
  EmptyState,
  ErrorState,
  FormField,
  InfoBanner,
  ListItem,
  LoadingState,
  Screen,
  palette,
  radius,
  spacing,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import { functionErrorKey } from '@/features/doctor/ai-review';
import { ChoiceChips } from '@/features/doctor/components/ChoiceChips';
import { ErrorBanner } from '@/features/doctor/components/ErrorBanner';
import { pickPdf, pickPhotos, takePhoto } from '@/features/doctor/files';
import { useChart, useMyId, useSummaryFunction, useUploadReport } from '@/features/doctor/hooks';
import { newId } from '@/features/doctor/ids';
import {
  movePage,
  overallProgress,
  REPORT_TYPES,
  reportMetaSchema,
  validatePages,
  type FileProgress,
  type PickedPage,
  type ReportMetaValues,
} from '@/features/doctor/report-upload';
import { useSecureScreen } from '@/features/doctor/use-secure-screen';

/** Add report (PLAN.md §7.4 #5): details, pages (photos or PDF), upload with progress, then optional AI. */
export default function AddReport() {
  const { pregnancyId } = useLocalSearchParams<{ pregnancyId: string }>();
  const { t } = useTranslation('doctor');
  const router = useRouter();
  useSecureScreen('doctor-add-report');
  const me = useMyId();
  const chart = useChart(pregnancyId);
  const upload = useUploadReport(pregnancyId);
  const ai = useSummaryFunction(pregnancyId);
  const today = todayISO();

  const [pages, setPages] = useState<PickedPage[]>([]);
  const [progress, setProgress] = useState<FileProgress[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<{ tone: 'success' | 'danger'; key: string } | null>(
    null,
  );

  const { control, handleSubmit } = useForm<ReportMetaValues, unknown, ReportMetaValues>({
    resolver: zodResolver(reportMetaSchema(today)),
    defaultValues: { type: 'blood', title: '', report_date: today, lab_name: '' },
  });

  if (chart.isPending)
    return (
      <Screen edges={['bottom']}>
        <LoadingState />
      </Screen>
    );
  if (chart.isError)
    return (
      <Screen edges={['bottom']}>
        <ErrorState onRetry={() => void chart.refetch()} />
      </Screen>
    );
  if (!chart.data) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="account-off-outline"
          title={t('chart.notFoundTitle')}
          message={t('chart.notFoundMessage')}
        />
      </Screen>
    );
  }
  const patientId = chart.data.patient.id;

  const add = async (pick: () => Promise<PickedPage[]>) => {
    const picked = await pick();
    if (picked.length > 0) setPages((p) => [...p, ...picked]);
    setIssues([]);
  };

  const submit = handleSubmit((meta) => {
    const problems = validatePages(pages);
    setIssues(problems);
    if (problems.length > 0 || !me) return;
    upload.mutate(
      {
        patientId,
        pregnancyId,
        uploadedBy: me,
        type: meta.type,
        title: meta.title,
        reportDate: meta.report_date,
        labName: meta.lab_name,
        pages,
        newId,
        onProgress: setProgress,
      },
      { onSuccess: setReportId },
    );
  });

  const runAi = () => {
    if (!reportId) return;
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

  if (reportId) {
    return (
      <Screen edges={['bottom']}>
        <Card
          variant="soft"
          title={t('report.uploadedTitle')}
          subtitle={t('report.uploadedMessage')}
        >
          {aiMessage ? <InfoBanner tone={aiMessage.tone} message={t(aiMessage.key)} /> : null}
          <Button label={t('report.extract')} loading={ai.isPending} onPress={runAi} />
          <Button
            label={t('report.enterByHand')}
            variant="secondary"
            onPress={() => router.replace(`/doctor/patient/${pregnancyId}/report/${reportId}`)}
          />
          <Button label={t('report.done')} variant="text" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const busy = upload.isPending;
  return (
    <Screen edges={['bottom']} subtitle={chart.data.patient.full_name}>
      <Card title={t('report.details')}>
        <Controller
          control={control}
          name="type"
          render={({ field: { value, onChange } }) => (
            <ChoiceChips
              allowClear={false}
              value={value}
              onChange={(v) => v !== '' && onChange(v)}
              options={REPORT_TYPES.map((r) => ({ value: r, label: t(`report.type.${r}`) }))}
            />
          )}
        />
        <FormField
          control={control}
          name="title"
          label={t('report.titleLabel')}
          hint={t('report.titleHint')}
        />
        <DateField
          control={control}
          name="report_date"
          label={t('report.date')}
          maximumDate={today}
        />
        <FormField control={control} name="lab_name" label={t('report.lab')} />
      </Card>

      <Card title={t('report.pages')} subtitle={t('report.pagesHint')}>
        {pages.map((p, i) => (
          <View key={p.key} style={styles.page}>
            {p.mime === 'application/pdf' ? (
              <ListItem icon="file-pdf-box" title={p.name} description={t('report.pdf')} />
            ) : (
              <View style={styles.thumbRow}>
                <Image
                  source={{ uri: p.uri }}
                  style={styles.thumb}
                  accessibilityLabel={t('report.page', { n: i + 1 })}
                />
                <Text variant="bodyLarge" style={styles.pageLabel}>
                  {t('report.page', { n: i + 1 })}
                </Text>
              </View>
            )}
            <View style={styles.pageActions}>
              <Button
                label={t('report.up')}
                variant="text"
                disabled={busy || i === 0}
                onPress={() => setPages((l) => movePage(l, i, i - 1))}
              />
              <Button
                label={t('report.down')}
                variant="text"
                disabled={busy || i === pages.length - 1}
                onPress={() => setPages((l) => movePage(l, i, i + 1))}
              />
              <Button
                label={t('report.remove')}
                variant="text"
                disabled={busy}
                onPress={() => setPages((l) => l.filter((x) => x.key !== p.key))}
              />
            </View>
          </View>
        ))}
        <View style={styles.pickRow}>
          <Button
            label={t('report.takePhoto')}
            variant="secondary"
            fullWidth={false}
            disabled={busy}
            onPress={() => void add(takePhoto)}
          />
          <Button
            label={t('report.choosePhotos')}
            variant="secondary"
            fullWidth={false}
            disabled={busy}
            onPress={() => void add(pickPhotos)}
          />
          <Button
            label={t('report.choosePdf')}
            variant="secondary"
            fullWidth={false}
            disabled={busy}
            onPress={() => void add(pickPdf)}
          />
        </View>
        {issues.map((k) => (
          <InfoBanner key={k} tone="danger" message={t(k)} />
        ))}
      </Card>

      {busy ? (
        <Card title={t('report.uploading')}>
          <ProgressBar
            progress={overallProgress(progress)}
            color={palette.rose}
            style={styles.bar}
          />
          <Text variant="bodySmall" style={styles.muted}>
            {t('report.progress', {
              done: progress.filter((f) => f.sent >= f.size && f.size > 0).length,
              total: pages.length,
            })}
          </Text>
        </Card>
      ) : null}
      <ErrorBanner error={upload.error} />
      <Button label={t('report.upload')} loading={busy} onPress={() => void submit()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outline,
  },
  thumbRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 64, height: 80, borderRadius: radius.sm, backgroundColor: palette.cream },
  pageLabel: { flex: 1 },
  pageActions: { flexDirection: 'row', gap: spacing.xs },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bar: { height: 8, borderRadius: radius.pill },
  muted: { color: palette.inkMuted },
});
