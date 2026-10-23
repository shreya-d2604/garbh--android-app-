import { format, parseISO } from 'date-fns';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { palette, radius, spacing } from './theme';

export interface SlotDay<S extends { starts_at: string }> {
  /** Device-local calendar date, YYYY-MM-DD. */
  date: string;
  slots: readonly S[];
}

export interface SlotPickerProps<S extends { starts_at: string }> {
  days: readonly SlotDay<S>[];
  selectedDay: string | null;
  onSelectDay: (date: string) => void;
  /** starts_at of the chosen slot. */
  selectedSlot: string | null;
  onSelectSlot: (slot: S) => void;
  /** Rendered between the day row and the times (e.g. a heading or a count). */
  timesHeader?: ReactNode;
}

const timeLabel = (iso: string) => format(new Date(iso), 'h:mm a');

/**
 * Day row + time grid for free appointment slots (available_slots). Presentational: the caller
 * loads the slots, groups them by day and handles loading / empty / error states.
 */
export function SlotPicker<S extends { starts_at: string }>({
  days,
  selectedDay,
  onSelectDay,
  selectedSlot,
  onSelectSlot,
  timesHeader,
}: SlotPickerProps<S>) {
  const { t } = useTranslation();
  const current = days.find((d) => d.date === selectedDay);
  return (
    <View style={styles.box}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.days}
      >
        {days.map((d) => {
          const selected = d.date === selectedDay;
          const date = parseISO(d.date);
          const textStyle = [styles.dayText, selected && styles.selectedText];
          return (
            <Pressable
              key={d.date}
              onPress={() => onSelectDay(d.date)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t('slots.dayLabel', {
                day: format(date, 'EEEE d MMMM'),
                count: d.slots.length,
              })}
              style={[styles.day, selected && styles.daySelected]}
            >
              <Text variant="labelMedium" style={textStyle}>
                {format(date, 'EEE')}
              </Text>
              <Text variant="headlineSmall" style={textStyle}>
                {format(date, 'd')}
              </Text>
              <Text variant="labelSmall" style={textStyle}>
                {format(date, 'MMM')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {timesHeader}
      <View style={styles.times}>
        {(current?.slots ?? []).map((s) => {
          const selected = s.starts_at === selectedSlot;
          return (
            <Pressable
              key={s.starts_at}
              onPress={() => onSelectSlot(s)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={timeLabel(s.starts_at)}
              style={[styles.time, selected && styles.timeSelected]}
            >
              <Text variant="titleSmall" style={[styles.timeText, selected && styles.selectedText]}>
                {timeLabel(s.starts_at)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  days: { gap: spacing.sm, paddingVertical: spacing.xs },
  day: {
    width: 68,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.white,
  },
  daySelected: { backgroundColor: palette.rose, borderColor: palette.rose },
  dayText: { color: palette.maroon },
  selectedText: { color: palette.white },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  time: {
    minWidth: 96,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.rose,
    backgroundColor: palette.white,
  },
  timeSelected: { backgroundColor: palette.rose },
  timeText: { color: palette.rose, fontWeight: '600' },
});
