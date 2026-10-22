import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ScrollView, StyleSheet } from 'react-native';
import { Dialog, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  DateField,
  EmptyState,
  FormField,
  InfoBanner,
  ListItem,
  StatusChip,
  palette,
  spacing,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';

import type { ClashAppointment } from '../../api';
import {
  previewClashes,
  useMyId,
  useScheduleActions,
  useTimeOff,
  useTimeOffClashes,
} from '../../hooks';
import { combineDateTime, findClashes, timeOffSchema, type TimeOffValues } from '../../schedule';
import { ErrorBanner } from '../ErrorBanner';
import { QueryBoundary } from '../QueryBoundary';
import { TimeField } from '../TimeField';

interface Pending {
  startsAt: string;
  endsAt: string;
  reason: string;
  clashes: ClashAppointment[];
}

/** Time off with a clash list: booked appointments that fall inside the leave (PLAN.md §7.4 #9). */
export function TimeOffCard() {
  const { t } = useTranslation('doctor');
  const me = useMyId();
  const today = todayISO();
  const timeOff = useTimeOff();
  const clashes = useTimeOffClashes();
  const { addTimeOff, deleteTimeOff } = useScheduleActions();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(false);

  const { control, handleSubmit, reset } = useForm<TimeOffValues, unknown, TimeOffValues>({
    resolver: zodResolver(timeOffSchema),
    defaultValues: {
      startDate: today,
      startTime: '09:00',
      endDate: today,
      endTime: '18:00',
      reason: '',
    },
  });

  const close = () => {
    setOpen(false);
    setPending(null);
    setCheckError(false);
    addTimeOff.reset();
    reset();
  };

  const save = (p: Pick<Pending, 'startsAt' | 'endsAt' | 'reason'>) =>
    addTimeOff.mutate(p, { onSuccess: close });

  const submit = handleSubmit(async (v) => {
    const startsAt = combineDateTime(v.startDate, v.startTime);
    const endsAt = combineDateTime(v.endDate, v.endTime);
    if (!startsAt || !endsAt || !me) return;
    setChecking(true);
    setCheckError(false);
    try {
      const found = findClashes({ startsAt, endsAt }, await previewClashes(me, startsAt, endsAt));
      if (found.length === 0) save({ startsAt, endsAt, reason: v.reason });
      else setPending({ startsAt, endsAt, reason: v.reason, clashes: found });
    } catch {
      setCheckError(true);
    } finally {
      setChecking(false);
    }
  });

  return (
    <Card title={t('schedule.timeOffTitle')} subtitle={t('schedule.timeOffHint')}>
      <QueryBoundary
        query={timeOff}
        isEmpty={(r) => r.length === 0}
        empty={
          <EmptyState
            icon="beach"
            title={t('schedule.timeOffEmptyTitle')}
            message={t('schedule.timeOffEmptyMessage')}
          />
        }
      >
        {(rows) => (
          <>
            {rows.map((r) => {
              const n = clashes.data?.[r.id]?.length ?? 0;
              return (
                <ListItem
                  key={r.id}
                  icon="beach"
                  title={`${format(new Date(r.starts_at), 'd MMM, h:mm a')} - ${format(new Date(r.ends_at), 'd MMM, h:mm a')}`}
                  description={r.reason ?? undefined}
                  right={
                    <>
                      {n > 0 ? (
                        <StatusChip label={t('schedule.clashCount', { count: n })} tone="warning" />
                      ) : null}
                      <Button
                        label={t('schedule.removeTimeOff')}
                        variant="text"
                        onPress={() => deleteTimeOff.mutate(r.id)}
                        accessibilityLabel={t('schedule.removeTimeOff')}
                      />
                    </>
                  }
                />
              );
            })}
            <ErrorBanner error={deleteTimeOff.error} />
          </>
        )}
      </QueryBoundary>
      <Button label={t('schedule.addTimeOff')} variant="secondary" onPress={() => setOpen(true)} />

      <Portal>
        <Dialog visible={open} onDismiss={close}>
          <Dialog.Title>{t(pending ? 'schedule.clashTitle' : 'schedule.addTimeOff')}</Dialog.Title>
          <Dialog.ScrollArea style={styles.scroll}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
              {pending ? (
                <>
                  <InfoBanner
                    tone="warning"
                    message={t('schedule.clashMessage', { count: pending.clashes.length })}
                  />
                  {pending.clashes.map((a) => (
                    <ListItem
                      key={a.id}
                      icon="calendar-alert"
                      title={a.patients?.full_name ?? ''}
                      description={format(new Date(a.starts_at), 'd MMM, h:mm a')}
                    />
                  ))}
                  <Text variant="bodySmall" style={styles.muted}>
                    {t('schedule.clashNext')}
                  </Text>
                </>
              ) : (
                <>
                  <DateField
                    control={control}
                    name="startDate"
                    label={t('schedule.startDate')}
                    minimumDate={today}
                  />
                  <TimeField control={control} name="startTime" label={t('schedule.startTime')} />
                  <DateField
                    control={control}
                    name="endDate"
                    label={t('schedule.endDate')}
                    minimumDate={today}
                  />
                  <TimeField control={control} name="endTime" label={t('schedule.endTime')} />
                  <FormField control={control} name="reason" label={t('schedule.reason')} />
                  {checkError ? (
                    <InfoBanner tone="danger" message={t('schedule.checkFailed')} />
                  ) : null}
                </>
              )}
              <ErrorBanner error={addTimeOff.error} />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button label={t('common:actions.cancel')} variant="text" onPress={close} />
            {pending ? (
              <Button
                label={t('schedule.addAnyway')}
                fullWidth={false}
                loading={addTimeOff.isPending}
                onPress={() => save(pending)}
              />
            ) : (
              <Button
                label={t('common:actions.save')}
                fullWidth={false}
                loading={checking || addTimeOff.isPending}
                onPress={() => void submit()}
              />
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 440 },
  body: { gap: spacing.xs, paddingVertical: spacing.sm },
  muted: { color: palette.inkMuted },
});
