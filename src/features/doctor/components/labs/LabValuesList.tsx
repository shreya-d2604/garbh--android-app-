import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, EmptyState, StatusChip, palette, spacing } from '@/components';

import { isLowConfidence, labDisplayValue } from '../../ai-review';
import { flagTone, labFormFromRow, labPatch, type LabFormValues } from '../../lab-form';
import { useReportActions } from '../../hooks';
import type { LabResultRow, LabTestRow } from '../../types';
import { ErrorBanner } from '../ErrorBanner';
import { LabEditDialog } from './LabEditDialog';

export interface LabValuesListProps {
  reportId: string;
  pregnancyId: string;
  results: readonly LabResultRow[];
  tests: readonly LabTestRow[];
  observedOn: string | null;
  /** Hide edit actions (e.g. when the summary is already published). */
  readOnly?: boolean;
}

const EMPTY: LabFormValues = { test_code: '', value: '', unit: '' };

/** Extracted / manual lab values with edit, verify and delete; low-confidence AI values are highlighted. */
export function LabValuesList({ reportId, pregnancyId, results, tests, observedOn, readOnly = false }: LabValuesListProps) {
  const { t } = useTranslation('doctor');
  const actions = useReportActions(reportId, pregnancyId);
  const [editing, setEditing] = useState<LabResultRow | 'new' | null>(null);
  const testByCode = useMemo(() => new Map(tests.map((x) => [x.code, x])), [tests]);

  const close = () => {
    setEditing(null);
    actions.addLab.reset();
    actions.updateLab.reset();
  };

  return (
    <Card title={t('labs.title')} subtitle={readOnly ? undefined : t('labs.subtitle')}>
      {results.length === 0 ? (
        <EmptyState icon="flask-outline" title={t('labs.emptyTitle')} message={t('labs.emptyMessage')} />
      ) : (
        results.map((r) => {
          const test = r.test_code ? testByCode.get(r.test_code) : undefined;
          const low = r.source === 'ai_extracted' && !r.verified && isLowConfidence(r.confidence);
          return (
            <View key={r.id} style={[styles.row, low && styles.lowRow]} accessibilityLabel={test?.name ?? r.raw_name ?? ''}>
              <View style={styles.main}>
                <Text variant="bodyLarge">{test?.name ?? r.raw_name ?? r.test_code}</Text>
                <Text variant="titleMedium" style={styles.value}>
                  {[labDisplayValue(r), r.unit].filter(Boolean).join(' ')}
                </Text>
                {r.ref_low != null || r.ref_high != null ? (
                  <Text variant="bodySmall" style={styles.muted}>
                    {t('labs.range', { low: r.ref_low ?? '-', high: r.ref_high ?? '-' })}
                  </Text>
                ) : null}
              </View>
              <View style={styles.chips}>
                {r.flag ? <StatusChip label={t(`labs.flag.${r.flag}`)} tone={flagTone(r.flag)} /> : null}
                <StatusChip label={t(`labs.source.${r.source}`)} tone="neutral" />
                {low ? <StatusChip label={t('labs.lowConfidence', { pct: Math.round((r.confidence ?? 0) * 100) })} tone="warning" /> : null}
                {r.verified ? <StatusChip label={t('labs.verifiedChip')} tone="success" /> : null}
              </View>
              {!readOnly && !r.verified ? (
                <View style={styles.actions}>
                  <Button label={t('labs.edit')} variant="text" onPress={() => setEditing(r)} />
                  <Button
                    label={t('labs.verify')}
                    variant="text"
                    onPress={() => actions.updateLab.mutate({ id: r.id, patch: { verified: true } })}
                  />
                  <Button label={t('labs.remove')} variant="text" onPress={() => actions.deleteLab.mutate(r.id)} />
                </View>
              ) : null}
            </View>
          );
        })
      )}
      <ErrorBanner error={actions.updateLab.error ?? actions.deleteLab.error} />
      {!readOnly ? <Button label={t('labs.add')} variant="secondary" onPress={() => setEditing('new')} /> : null}

      <LabEditDialog
        visible={editing !== null}
        tests={tests}
        adding={editing === 'new'}
        initial={editing && editing !== 'new' ? labFormFromRow(editing) : EMPTY}
        saving={actions.addLab.isPending || actions.updateLab.isPending}
        error={actions.addLab.error ?? actions.updateLab.error}
        onDismiss={close}
        onSubmit={(values, verify) => {
          const test = testByCode.get(values.test_code);
          if (editing === 'new') {
            actions.addLab.mutate({ reportId, pregnancyId, values, test, observedOn, verify }, { onSuccess: close });
          } else if (editing) {
            actions.updateLab.mutate(
              { id: editing.id, patch: labPatch(values, test) },
              { onSuccess: close },
            );
          }
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.outline },
  lowRow: { backgroundColor: palette.warningSoft, paddingHorizontal: spacing.sm, borderRadius: 8 },
  main: { gap: 2 },
  value: { color: palette.maroon },
  muted: { color: palette.inkMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
