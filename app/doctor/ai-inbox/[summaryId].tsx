import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoBanner,
  LoadingState,
  Screen,
  StatusChip,
  palette,
  spacing,
} from '@/components';
import { aiSummaryDocumentSchema, type AiSummaryDocument } from '@/domain/schemas/ai-summary';
import type { SummaryDetail } from '@/features/doctor/api';
import {
  countLowConfidence,
  documentFromRow,
  documentIssues,
  functionErrorKey,
  normalizeDocument,
  regenerateRequest,
} from '@/features/doctor/ai-review';
import { SummaryEditor } from '@/features/doctor/components/ai/SummaryEditor';
import { ChoiceChips } from '@/features/doctor/components/ChoiceChips';
import { ConfirmDialog } from '@/features/doctor/components/ConfirmDialog';
import { ErrorBanner } from '@/features/doctor/components/ErrorBanner';
import { LabValuesList } from '@/features/doctor/components/labs/LabValuesList';
import { ReportPageView } from '@/features/doctor/components/ReportPageView';
import { useReviewSummary, useSummaryDetail, useSummaryFunction } from '@/features/doctor/hooks';
import { useSecureScreen } from '@/features/doctor/use-secure-screen';

const WIDE = 900;
type Pane = 'original' | 'values' | 'summary';

/** Review one AI draft: original | extracted values | summary, then approve, save, reject or regenerate. */
export default function SummaryReview() {
  const { summaryId } = useLocalSearchParams<{ summaryId: string }>();
  const { t } = useTranslation('doctor');
  useSecureScreen('doctor-summary');
  const detail = useSummaryDetail(summaryId);

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
          title={t('ai.notFoundTitle')}
          message={t('ai.notFoundMessage')}
        />
      </Screen>
    );
  }
  return <ReviewBody summaryId={summaryId} detail={detail.data} />;
}

function ReviewBody({ summaryId, detail }: { summaryId: string; detail: SummaryDetail }) {
  const { t } = useTranslation('doctor');
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { summary } = detail;
  const review = useReviewSummary(summaryId);
  const regenerate = useSummaryFunction(summary.pregnancy_id);

  const [doc, setDoc] = useState<AiSummaryDocument | null>(() => documentFromRow(summary));
  const [pane, setPane] = useState<Pane>('summary');
  const [issues, setIssues] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<'approve' | 'regenerate' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; key: string } | null>(null);

  const editable = summary.status === 'draft';
  const wide = width >= WIDE;
  const hasOriginal = detail.files.length > 0 || detail.consultation !== null;
  const hasValues = summary.source_type === 'report';
  const unchecked = countLowConfidence(detail.results);
  const flags = doc?.summary.doctor_attention_flags ?? [];

  const validated = (): AiSummaryDocument | null => {
    if (!doc) return null;
    const clean = normalizeDocument(doc);
    const problems = documentIssues(clean);
    const parsed = aiSummaryDocumentSchema.safeParse(clean);
    if (!parsed.success && problems.length === 0) problems.push('ai.issues.invalid');
    setIssues(problems);
    return problems.length === 0 ? clean : null;
  };

  const run = (action: 'save_draft' | 'approve_publish', done: () => void) => {
    const clean = validated();
    if (!clean) return;
    review.mutate([action, clean, null], { onSuccess: done });
  };

  const saveDraft = () =>
    run('save_draft', () => setMessage({ tone: 'success', key: 'ai.draftSaved' }));
  const approve = () => {
    setConfirm(null);
    run('approve_publish', () => router.back());
  };
  const reject = () =>
    review.mutate(['reject', null, note.trim() || null], {
      onSuccess: () => router.back(),
      onSettled: () => setRejecting(false),
    });
  const doRegenerate = () => {
    setConfirm(null);
    const req = regenerateRequest(summary);
    if (!req) {
      setMessage({ tone: 'danger', key: 'ai.errors.GENERIC' });
      return;
    }
    regenerate.mutate(req, {
      onSuccess: (res) =>
        setMessage(
          res.ok
            ? { tone: 'success', key: 'ai.regenerated' }
            : { tone: 'danger', key: functionErrorKey(res.code) },
        ),
    });
  };

  const original = (
    <Card title={t('ai.original')}>
      {detail.files.map((f) => (
        <ReportPageView key={f.id} file={f} />
      ))}
      {detail.consultation ? (
        <View style={styles.consult}>
          <Text variant="bodyMedium">{detail.consultation.advice ?? ''}</Text>
          <Text variant="bodyMedium">{detail.consultation.findings ?? ''}</Text>
        </View>
      ) : null}
      {!hasOriginal ? <InfoBanner tone="info" message={t('ai.noOriginal')} /> : null}
    </Card>
  );
  const values = detail.report ? (
    <LabValuesList
      reportId={detail.report.id}
      pregnancyId={summary.pregnancy_id}
      results={detail.results}
      tests={detail.tests}
      observedOn={detail.report.report_date}
      readOnly={!editable}
    />
  ) : null;
  const editor = doc ? (
    <SummaryEditor
      value={doc.summary}
      onChange={(s) => setDoc({ ...doc, summary: s })}
      readOnly={!editable}
    />
  ) : (
    <InfoBanner tone="danger" message={t('ai.unreadable')} />
  );

  const panes: { value: Pane; label: string }[] = [
    ...(hasOriginal ? [{ value: 'original' as const, label: t('ai.paneOriginal') }] : []),
    ...(hasValues ? [{ value: 'values' as const, label: t('ai.paneValues') }] : []),
    { value: 'summary', label: t('ai.paneSummary') },
  ];

  return (
    <Screen
      edges={['bottom']}
      title={detail.patientName}
      subtitle={t(`inbox.source.${summary.source_type}`)}
      footer={
        editable ? (
          <View style={styles.footer}>
            <Button
              label={t('ai.approve')}
              loading={review.isPending}
              onPress={() => (validated() ? setConfirm('approve') : undefined)}
            />
            <View style={styles.footerRow}>
              <Button
                label={t('ai.saveDraft')}
                variant="secondary"
                fullWidth={false}
                disabled={review.isPending}
                onPress={saveDraft}
              />
              <Button
                label={t('ai.regenerate')}
                variant="text"
                disabled={review.isPending || regenerate.isPending}
                onPress={() => setConfirm('regenerate')}
              />
              <Button
                label={t('ai.reject')}
                variant="text"
                disabled={review.isPending}
                onPress={() => setRejecting(true)}
              />
            </View>
          </View>
        ) : undefined
      }
    >
      <View style={styles.statusRow}>
        <StatusChip
          label={t(`inbox.status.${summary.status}`)}
          tone={
            summary.status === 'published'
              ? 'success'
              : summary.status === 'draft'
                ? 'warning'
                : 'neutral'
          }
        />
        {unchecked > 0 && editable ? (
          <StatusChip label={t('ai.uncheckedValues', { count: unchecked })} tone="warning" />
        ) : null}
      </View>
      {summary.status === 'failed' ? (
        <InfoBanner tone="danger" message={t('ai.failedNote')} />
      ) : null}
      {summary.status === 'generating' ? (
        <InfoBanner tone="info" message={t('ai.generatingNote')} />
      ) : null}
      {summary.doctor_note ? (
        <InfoBanner tone="info" message={t('ai.rejectedNote', { note: summary.doctor_note })} />
      ) : null}
      {flags.length > 0 ? (
        <Card variant="soft" title={t('ai.flagsTitle')} subtitle={t('ai.flagsHint')}>
          {flags.map((f, i) => (
            <InfoBanner key={i} tone="warning" icon="alert-outline" message={f} />
          ))}
        </Card>
      ) : null}
      {message ? <InfoBanner tone={message.tone} message={t(message.key)} /> : null}
      {issues.map((k) => (
        <InfoBanner key={k} tone="danger" message={t(k)} />
      ))}
      <ErrorBanner error={review.error} />

      {wide ? (
        <View style={styles.columns}>
          {hasOriginal ? <View style={styles.col}>{original}</View> : null}
          {hasValues && values ? <View style={styles.col}>{values}</View> : null}
          <View style={styles.col}>{editor}</View>
        </View>
      ) : (
        <>
          {panes.length > 1 ? (
            <ChoiceChips
              scroll
              allowClear={false}
              value={pane}
              onChange={(v) => v !== '' && setPane(v)}
              options={panes}
            />
          ) : null}
          {pane === 'original' && hasOriginal ? original : null}
          {pane === 'values' && hasValues ? values : null}
          {pane === 'summary' || (!hasOriginal && !hasValues) ? editor : null}
        </>
      )}

      <ConfirmDialog
        visible={confirm === 'approve'}
        title={t('ai.approveTitle')}
        message={t(unchecked > 0 ? 'ai.approveMessageUnchecked' : 'ai.approveMessage', {
          count: unchecked,
        })}
        confirmLabel={t('ai.approve')}
        loading={review.isPending}
        onDismiss={() => setConfirm(null)}
        onConfirm={approve}
      />
      <ConfirmDialog
        visible={confirm === 'regenerate'}
        title={t('ai.regenerateTitle')}
        message={t('ai.regenerateMessage')}
        confirmLabel={t('ai.regenerate')}
        loading={regenerate.isPending}
        onDismiss={() => setConfirm(null)}
        onConfirm={doRegenerate}
      />
      <Portal>
        <Dialog visible={rejecting} onDismiss={() => setRejecting(false)}>
          <Dialog.Title>{t('ai.rejectTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.rejectText}>
              {t('ai.rejectMessage')}
            </Text>
            <TextInput
              mode="outlined"
              multiline
              label={t('ai.rejectNote')}
              value={note}
              onChangeText={setNote}
              accessibilityLabel={t('ai.rejectNote')}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              label={t('common:actions.cancel')}
              variant="text"
              onPress={() => setRejecting(false)}
            />
            <Button
              label={t('ai.reject')}
              variant="danger"
              fullWidth={false}
              loading={review.isPending}
              onPress={reject}
            />
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  columns: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  col: { flex: 1, gap: spacing.md },
  consult: { gap: spacing.sm },
  footer: { padding: spacing.md, gap: spacing.xs, backgroundColor: palette.cream },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  rejectText: { marginBottom: spacing.sm },
});
