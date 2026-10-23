import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  palette,
  SlotPicker as SlotGrid,
} from '@/components';
import { addDays, todayISO } from '@/domain/pregnancy-math';

import { groupSlotsByDay } from '../calendar';
import { useFreeSlots } from '../hooks';

const FIRST_HORIZON_DAYS = 14;
const MAX_HORIZON_DAYS = 62; // available_slots accepts at most 62 days

export interface SlotPickerProps {
  doctorId: string | undefined;
  /** ISO start of the chosen slot. */
  selected: string | null;
  onSelect: (startsAt: string) => void;
}

/** Free slots of one doctor from available_slots: pick a day, then a time. */
export function SlotPicker({ doctorId, selected, onSelect }: SlotPickerProps) {
  const { t } = useTranslation('reception');
  const [horizon, setHorizon] = useState(FIRST_HORIZON_DAYS);
  const [pickedDay, setDay] = useState<string | null>(null);
  const today = todayISO();
  const { data, isPending, isError, refetch } = useFreeSlots(
    doctorId,
    today,
    addDays(today, horizon - 1),
  );
  const groups = useMemo(() => groupSlotsByDay(data ?? []), [data]);

  // The day the user tapped, else the day of the chosen slot, else the first day with free slots.
  const selectedGroup = selected
    ? groups.find((g) => g.slots.some((x) => x.starts_at === selected))
    : undefined;
  const current = groups.find((g) => g.date === pickedDay) ?? selectedGroup ?? groups[0];

  if (!doctorId) return <EmptyState icon="doctor" title={t('slots.pickDoctor')} />;
  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const more =
    horizon < MAX_HORIZON_DAYS ? (
      <Button
        label={t('slots.lookFurther')}
        variant="text"
        onPress={() => setHorizon(Math.min(horizon + FIRST_HORIZON_DAYS, MAX_HORIZON_DAYS))}
      />
    ) : null;

  if (groups.length === 0) {
    return (
      <View>
        <EmptyState
          icon="calendar-remove"
          title={t('slots.none', { days: horizon })}
          message={t('slots.noneHint')}
        />
        {more}
      </View>
    );
  }

  return (
    <View>
      <SlotGrid
        days={groups}
        selectedDay={current?.date ?? null}
        onSelectDay={setDay}
        selectedSlot={selected}
        onSelectSlot={(s) => onSelect(s.starts_at)}
        timesHeader={
          <Text variant="bodySmall" style={styles.muted}>
            {t('slots.count', { count: current?.slots.length ?? 0 })}
          </Text>
        }
      />
      {more}
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { color: palette.inkMuted },
});
