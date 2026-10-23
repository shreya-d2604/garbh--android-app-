import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Dialog, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  EmptyState,
  FormField,
  InfoBanner,
  ListItem,
  palette,
  QueryBoundary,
  spacing,
} from '@/components';

import { useAvailability, useScheduleActions } from '../../hooks';
import {
  availabilitySchema,
  groupByWeekday,
  overlapsExisting,
  trimTime,
  weeklyMinutes,
  type AvailabilityValues,
} from '../../schedule';
import type { AvailabilityRow } from '../../types';
import { ErrorBanner } from '../ErrorBanner';
import { TimeField } from '../TimeField';

interface Editing {
  id: string | null;
  weekday: number;
}

/** Weekly availability (PLAN.md §7.4 #9): working hours per weekday, in the hospital's local time. */
export function AvailabilityCard() {
  const { t } = useTranslation('doctor');
  const availability = useAvailability();
  const [editing, setEditing] = useState<Editing | null>(null);
  const rows = availability.data ?? [];

  return (
    <QueryBoundary
      query={availability}
      isEmpty={(r) => r.length === 0}
      empty={
        <Card title={t('schedule.hoursTitle')}>
          <EmptyState
            icon="calendar-clock"
            title={t('schedule.hoursEmptyTitle')}
            message={t('schedule.hoursEmptyMessage')}
          />
          <Button
            label={t('schedule.addHours')}
            onPress={() => setEditing({ id: null, weekday: 1 })}
          />
          <AvailabilityDialog editing={editing} rows={rows} onDismiss={() => setEditing(null)} />
        </Card>
      }
    >
      {(data) => {
        const mins = weeklyMinutes(data);
        return (
          <Card
            title={t('schedule.hoursTitle')}
            subtitle={t('schedule.hoursSummary', { hours: Math.round((mins / 60) * 10) / 10 })}
          >
            {groupByWeekday(data).map((day) => (
              <View key={day.weekday} style={styles.day}>
                <Text variant="labelLarge" style={styles.dayName}>
                  {t(`schedule.weekday.${day.weekday}`)}
                </Text>
                {day.rows.length === 0 ? (
                  <Text variant="bodySmall" style={styles.muted}>
                    {t('schedule.off')}
                  </Text>
                ) : (
                  day.rows.map((r) => (
                    <ListItem
                      key={r.id}
                      icon="clock-outline"
                      title={`${trimTime(r.start_time)} - ${trimTime(r.end_time)}`}
                      description={t('schedule.slotMinutes', { minutes: r.slot_minutes })}
                      onPress={() => setEditing({ id: r.id, weekday: r.weekday })}
                      accessibilityLabel={t('schedule.editHours', {
                        day: t(`schedule.weekday.${day.weekday}`),
                      })}
                    />
                  ))
                )}
                <Button
                  label={t('schedule.addHoursFor', { day: t(`schedule.weekday.${day.weekday}`) })}
                  variant="text"
                  onPress={() => setEditing({ id: null, weekday: day.weekday })}
                />
              </View>
            ))}
            <AvailabilityDialog editing={editing} rows={data} onDismiss={() => setEditing(null)} />
          </Card>
        );
      }}
    </QueryBoundary>
  );
}

function AvailabilityDialog({
  editing,
  rows,
  onDismiss,
}: {
  editing: Editing | null;
  rows: readonly AvailabilityRow[];
  onDismiss: () => void;
}) {
  const { t } = useTranslation('doctor');
  const { saveAvailability, deleteAvailability } = useScheduleActions();
  const existing = editing?.id ? rows.find((r) => r.id === editing.id) : undefined;
  const [overlap, setOverlap] = useState(false);

  const { control, handleSubmit, reset } = useForm<AvailabilityValues, unknown, AvailabilityValues>(
    {
      resolver: zodResolver(availabilitySchema),
      values: {
        start: existing ? trimTime(existing.start_time) : '10:00',
        end: existing ? trimTime(existing.end_time) : '13:00',
        slot: String(existing?.slot_minutes ?? 15),
      },
    },
  );

  const close = () => {
    setOverlap(false);
    saveAvailability.reset();
    deleteAvailability.reset();
    reset();
    onDismiss();
  };

  const submit = handleSubmit((v) => {
    if (!editing) return;
    if (overlapsExisting(editing.weekday, v.start, v.end, rows, editing.id)) {
      setOverlap(true);
      return;
    }
    setOverlap(false);
    saveAvailability.mutate(
      {
        id: editing.id,
        weekday: editing.weekday,
        start: v.start,
        end: v.end,
        slot: Number(v.slot),
      },
      { onSuccess: close },
    );
  });

  return (
    <Portal>
      <Dialog visible={editing !== null} onDismiss={close}>
        <Dialog.Title>{editing ? t(`schedule.weekday.${editing.weekday}`) : ''}</Dialog.Title>
        <Dialog.Content>
          <TimeField control={control} name="start" label={t('schedule.from')} />
          <TimeField control={control} name="end" label={t('schedule.to')} />
          <FormField
            control={control}
            name="slot"
            label={t('schedule.slot')}
            hint={t('schedule.slotHint')}
            keyboardType="number-pad"
          />
          {overlap ? <InfoBanner tone="danger" message={t('schedule.overlap')} /> : null}
          <ErrorBanner error={saveAvailability.error ?? deleteAvailability.error} />
        </Dialog.Content>
        <Dialog.Actions>
          {editing?.id ? (
            <Button
              label={t('schedule.deleteHours')}
              variant="text"
              loading={deleteAvailability.isPending}
              onPress={() =>
                editing.id && deleteAvailability.mutate(editing.id, { onSuccess: close })
              }
            />
          ) : null}
          <Button label={t('common:actions.cancel')} variant="text" onPress={close} />
          <Button
            label={t('common:actions.save')}
            fullWidth={false}
            loading={saveAvailability.isPending}
            onPress={() => void submit()}
          />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  day: { gap: 2, paddingBottom: spacing.xs },
  dayName: { color: palette.maroon },
  muted: { color: palette.inkMuted },
});
