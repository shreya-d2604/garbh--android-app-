import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import type { Database } from '@/types/database';

import { radius, spacing, toneColors, type Tone } from './theme';

export interface StatusChipProps {
  label: string;
  tone?: Tone;
}

/** Small coloured pill for statuses ("Booked", "Doctor reviewed", "High risk", ...). */
export function StatusChip({ label, tone = 'neutral' }: StatusChipProps) {
  const c = toneColors[tone];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]} accessibilityRole="text">
      <Text variant="labelMedium" style={{ color: c.fg }}>
        {label}
      </Text>
    </View>
  );
}

type ApptStatus = Database['public']['Enums']['appt_status'];

/** Shared tone mapping so every role shows appointment statuses the same way. */
export const APPOINTMENT_STATUS_TONE: Record<ApptStatus, Tone> = {
  booked: 'primary',
  confirmed: 'primary',
  checked_in: 'info',
  in_consultation: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
};

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
});
