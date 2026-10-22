import { StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';

import { palette, spacing } from '@/components';

interface Props {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ label, value, onChange, disabled }: Props) {
  return (
    <View style={styles.row}>
      <Text variant="bodyLarge" style={styles.label}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        color={palette.rose}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    gap: spacing.md,
  },
  label: { flex: 1, color: palette.ink },
});
