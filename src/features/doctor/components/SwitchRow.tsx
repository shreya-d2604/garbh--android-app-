import { StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';

import { palette, spacing } from '@/components';

export interface SwitchRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/** Label + hint + switch, at least 48px tall. */
export function SwitchRow({ label, hint, value, onChange, disabled }: SwitchRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text variant="bodyLarge">{label}</Text>
        {hint ? (
          <Text variant="bodySmall" style={styles.hint}>
            {hint}
          </Text>
        ) : null}
      </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  texts: { flex: 1 },
  hint: { color: palette.inkMuted },
});
