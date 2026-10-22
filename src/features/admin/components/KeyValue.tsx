import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { palette, spacing } from '@/components';

interface Props {
  label: string;
  value?: string | null;
}

/** "Label ... value" row for read-only details. Empty values show a dash. */
export function KeyValue({ label, value }: Props) {
  return (
    <View style={styles.row} accessibilityLabel={`${label}: ${value || '-'}`}>
      <Text variant="bodyMedium" style={styles.label}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.value}>
        {value || '-'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 2 },
  label: { color: palette.inkMuted, flexShrink: 0 },
  value: { color: palette.ink, flex: 1, textAlign: 'right' },
});
