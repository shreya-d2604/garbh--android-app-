import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import { palette, spacing } from '@/components';

export interface Choice<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly Choice<T>[];
  value: T | '';
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

/** Single-choice chips (filters, short selects). */
export function ChoiceChips<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      {options.map((o) => (
        <Chip
          key={o.value}
          selected={value === o.value}
          showSelectedCheck
          onPress={() => onChange(o.value)}
          accessibilityLabel={o.label}
          style={[styles.chip, value === o.value && styles.selected]}
          textStyle={styles.text}
        >
          {o.label}
        </Chip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { backgroundColor: palette.white, borderWidth: 1, borderColor: palette.outline, minHeight: 40 },
  selected: { backgroundColor: palette.roseSoft, borderColor: palette.rose },
  text: { color: palette.ink },
});
