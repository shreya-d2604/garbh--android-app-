import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { palette, radius, spacing } from '@/components';

interface Props {
  value: string | number;
  label: string;
  tone?: 'default' | 'danger';
}

/** Big number with a caption (dashboard). */
export function StatTile({ value, label, tone = 'default' }: Props) {
  return (
    <View style={styles.tile} accessibilityLabel={`${label}: ${value}`}>
      <Text variant="headlineMedium" style={[styles.value, tone === 'danger' && styles.danger]}>
        {value}
      </Text>
      <Text variant="labelMedium" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 90,
    backgroundColor: palette.roseMist,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  value: { color: palette.maroon, fontWeight: '700' },
  danger: { color: palette.danger },
  label: { color: palette.inkMuted },
});
