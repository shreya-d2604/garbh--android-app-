import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, EmptyState, ErrorState, LoadingState, palette, spacing } from '@/components';
import { addDays, todayISO } from '@/domain/pregnancy-math';

import { groupSlotsByDay } from '../calendar';
import { formatISODay, formatTime } from '../format';
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
    <View style={styles.box}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {groups.map((g) => (
          <Chip
            key={g.date}
            mode="outlined"
            selected={g.date === current?.date}
            onPress={() => setDay(g.date)}
            style={[styles.chip, g.date === current?.date && styles.selected]}
            accessibilityLabel={t('slots.dayLabel', {
              day: formatISODay(g.date),
              count: g.slots.length,
            })}
          >
            {formatISODay(g.date)}
          </Chip>
        ))}
      </ScrollView>
      <Text variant="bodySmall" style={styles.muted}>
        {t('slots.count', { count: current?.slots.length ?? 0 })}
      </Text>
      <View style={styles.times}>
        {current?.slots.map((s) => (
          <Chip
            key={s.starts_at}
            mode="outlined"
            selected={s.starts_at === selected}
            onPress={() => onSelect(s.starts_at)}
            style={[styles.chip, s.starts_at === selected && styles.selected]}
            accessibilityLabel={formatTime(s.starts_at)}
          >
            {formatTime(s.starts_at)}
          </Chip>
        ))}
      </View>
      {more}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    borderColor: palette.outline,
    backgroundColor: palette.white,
  },
  selected: { backgroundColor: palette.roseSoft, borderColor: palette.rose },
  muted: { color: palette.inkMuted },
});
