import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, EmptyState, FormField, InfoBanner, StatusChip, palette, spacing, type Tone } from '@/components';
import { todayISO } from '@/domain/pregnancy-math';

import { parseList } from '../../format';
import { useMyId, usePregnancyVisits, useVisitPlanActions } from '../../hooks';
import {
  buildExtraVisit,
  canDeleteVisit,
  EMPTY_EXTRA_VISIT,
  extraVisitSchema,
  isEditable,
  shiftVisit,
  sortVisits,
  visitState,
  type ExtraVisitValues,
  type VisitState,
} from '../../visit-plan';
import type { VisitRow } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorBanner } from '../ErrorBanner';
import { QueryBoundary } from '../QueryBoundary';

const TONE: Record<VisitState, Tone> = {
  completed: 'success',
  scheduled: 'info',
  skipped: 'neutral',
  cancelled: 'neutral',
  missed: 'danger',
  overdue: 'danger',
  due: 'warning',
  upcoming: 'primary',
};

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
const dateText = (iso: string | null) => (iso ? format(toDate(iso), 'd MMM') : '-');

export interface VisitPlanTabProps {
  pregnancyId: string;
  edd: string | null;
}

/** Visit plan editor (PLAN.md §7.4 #7): extra visits, move / skip / cancel, tests, high-risk template. */
export function VisitPlanTab({ pregnancyId, edd }: VisitPlanTabProps) {
  const { t } = useTranslation('doctor');
  const visits = usePregnancyVisits(pregnancyId);
  const actions = useVisitPlanActions(pregnancyId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<VisitRow | null>(null);
  const [schedule, setSchedule] = useState<'standard' | 'high_risk' | null>(null);
  const today = todayISO();

  return (
    <>
      <View style={styles.buttons}>
        <Button label={t('plan.addExtra')} onPress={() => setAdding(true)} disabled={!edd} />
        <Button label={t('plan.useHighRisk')} variant="secondary" onPress={() => setSchedule('high_risk')} disabled={!edd} />
        <Button label={t('plan.useStandard')} variant="text" onPress={() => setSchedule('standard')} disabled={!edd} />
      </View>
      {!edd ? <InfoBanner tone="warning" message={t('plan.needsEdd')} /> : null}
      {actions.applyTemplate.isError ? <ErrorBanner error={actions.applyTemplate.error} /> : null}

      <QueryBoundary
        query={visits}
        isEmpty={(v) => v.length === 0}
        empty={<EmptyState icon="calendar-blank-outline" title={t('plan.emptyTitle')} message={t('plan.emptyMessage')} />}
      >
        {(rows) => (
          <>
            {sortVisits(rows).map((v) => {
              const state = visitState(v, today);
              return (
                <Card
                  key={v.id}
                  title={v.title}
                  subtitle={t('plan.window', { week: v.target_week, from: dateText(v.due_from), to: dateText(v.due_to) })}
                  right={<StatusChip label={t(`visit.state.${state}`)} tone={TONE[state]} />}
                  onPress={isEditable(v) ? () => setEditing(v) : undefined}
                  accessibilityLabel={t('plan.edit', { title: v.title })}
                >
                  {v.is_extra ? (
                    <StatusChip label={t('plan.extraChip', { reason: v.reason_added ?? '' })} tone="info" />
                  ) : null}
                  {v.recommended_tests.length > 0 ? (
                    <Text variant="bodySmall" style={styles.tests}>
                      {v.recommended_tests.join(', ')}
                    </Text>
                  ) : null}
                </Card>
              );
            })}
          </>
        )}
      </QueryBoundary>

      {edd ? (
        <AddVisitDialog
          visible={adding}
          pregnancyId={pregnancyId}
          edd={edd}
          existing={visits.data ?? []}
          onDismiss={() => setAdding(false)}
        />
      ) : null}
      <EditVisitDialog visit={editing} pregnancyId={pregnancyId} onDismiss={() => setEditing(null)} />
      <ConfirmDialog
        visible={schedule !== null}
        title={t(schedule === 'high_risk' ? 'plan.highRiskTitle' : 'plan.standardTitle')}
        message={t('plan.templateMessage')}
        confirmLabel={t('plan.templateConfirm')}
        loading={actions.applyTemplate.isPending}
        onDismiss={() => setSchedule(null)}
        onConfirm={() => schedule && actions.applyTemplate.mutate(schedule, { onSettled: () => setSchedule(null) })}
      />
    </>
  );
}

function AddVisitDialog({
  visible,
  pregnancyId,
  edd,
  existing,
  onDismiss,
}: {
  visible: boolean;
  pregnancyId: string;
  edd: string;
  existing: readonly VisitRow[];
  onDismiss: () => void;
}) {
  const { t } = useTranslation('doctor');
  const me = useMyId();
  const { add } = useVisitPlanActions(pregnancyId);
  const { control, handleSubmit, reset } = useForm<ExtraVisitValues, unknown, ExtraVisitValues>({
    resolver: zodResolver(extraVisitSchema),
    defaultValues: EMPTY_EXTRA_VISIT,
  });

  const close = () => {
    reset(EMPTY_EXTRA_VISIT);
    add.reset();
    onDismiss();
  };
  const submit = handleSubmit((values) => {
    if (!me) return;
    add.mutate(
      buildExtraVisit({ pregnancyId, edd, addedBy: me, existing, values, defaultTitle: t('plan.defaultTitle') }),
      { onSuccess: close },
    );
  });

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={close}>
        <Dialog.Title>{t('plan.addTitle')}</Dialog.Title>
        <Dialog.ScrollArea style={styles.scroll}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <FormField control={control} name="week" label={t('plan.week')} hint={t('plan.weekHint')} keyboardType="number-pad" />
            <FormField control={control} name="reason" label={t('plan.reason')} hint={t('plan.reasonHint')} />
            <FormField control={control} name="title" label={t('plan.titleLabel')} />
            <FormField control={control} name="tests" label={t('plan.tests')} hint={t('plan.testsHint')} />
            <ErrorBanner error={add.error} />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button label={t('common:actions.cancel')} variant="text" onPress={close} />
          <Button label={t('plan.addConfirm')} fullWidth={false} loading={add.isPending} onPress={() => void submit()} />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function EditVisitDialog({
  visit,
  pregnancyId,
  onDismiss,
}: {
  visit: VisitRow | null;
  pregnancyId: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('doctor');
  const { update, remove } = useVisitPlanActions(pregnancyId);
  const [tests, setTests] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = update.isPending || remove.isPending;

  const close = () => {
    setTests(null);
    setConfirmDelete(false);
    update.reset();
    remove.reset();
    onDismiss();
  };
  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) =>
    visit && update.mutate({ id: visit.id, patch: p }, { onSuccess: close });

  const earlier = visit ? shiftVisit(visit, -1) : null;
  const later = visit ? shiftVisit(visit, 1) : null;
  const inactive = visit?.status === 'skipped' || visit?.status === 'cancelled' || visit?.status === 'missed';

  return (
    <Portal>
      <Dialog visible={visit !== null} onDismiss={close}>
        <Dialog.Title>{visit?.title ?? ''}</Dialog.Title>
        <Dialog.ScrollArea style={styles.scroll}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogBody}>
            {visit && !inactive ? (
              <>
                <View style={styles.row}>
                  <Button label={t('plan.earlier')} variant="secondary" fullWidth={false} disabled={!earlier || busy} onPress={() => earlier && patch(earlier)} />
                  <Button label={t('plan.later')} variant="secondary" fullWidth={false} disabled={!later || busy} onPress={() => later && patch(later)} />
                </View>
                <Button label={t('plan.skip')} variant="secondary" disabled={busy} onPress={() => patch({ status: 'skipped' })} />
                <Button label={t('plan.cancelVisit')} variant="secondary" disabled={busy} onPress={() => patch({ status: 'cancelled' })} />
              </>
            ) : null}
            {visit && inactive ? (
              <Button label={t('plan.restore')} disabled={busy} onPress={() => patch({ status: 'planned' })} />
            ) : null}
            <TextInput
              mode="outlined"
              label={t('plan.tests')}
              value={tests ?? visit?.recommended_tests.join(', ') ?? ''}
              onChangeText={setTests}
              accessibilityLabel={t('plan.tests')}
            />
            <Button
              label={t('plan.saveTests')}
              variant="secondary"
              disabled={busy || tests === null}
              onPress={() => patch({ recommended_tests: parseList(tests) })}
            />
            {visit && canDeleteVisit(visit) ? (
              <Button label={t('plan.deleteExtra')} variant="danger" disabled={busy} onPress={() => setConfirmDelete(true)} />
            ) : null}
            <ErrorBanner error={update.error ?? remove.error} />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button label={t('common:actions.back')} variant="text" onPress={close} />
        </Dialog.Actions>
      </Dialog>
      <ConfirmDialog
        visible={confirmDelete}
        title={t('plan.deleteTitle')}
        message={t('plan.deleteMessage')}
        confirmLabel={t('plan.deleteExtra')}
        danger
        loading={remove.isPending}
        onDismiss={() => setConfirmDelete(false)}
        onConfirm={() => visit && remove.mutate(visit.id, { onSuccess: close })}
      />
    </Portal>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: spacing.sm },
  tests: { color: palette.inkMuted },
  scroll: { maxHeight: 420 },
  dialogBody: { gap: spacing.sm, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
});
