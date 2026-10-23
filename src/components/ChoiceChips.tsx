import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import { palette, spacing } from './theme';

export interface ChoiceChipsProps<V extends string | number> {
  options: readonly { value: V; label: string }[];
  /** Selected value, or null/'' for none. */
  value: V | null | '';
  /** Receives '' when the selected chip is tapped again and allowClear is on. */
  onChange: (value: V | '') => void;
  /** Tapping the selected chip clears it (default true). */
  allowClear?: boolean;
  /** One horizontally scrolling row instead of wrapping. */
  scroll?: boolean;
  accessibilityLabel?: string;
}

/** Single-choice chips for filters, short selects and exam findings. */
export function ChoiceChips<V extends string | number>({
  options,
  value,
  onChange,
  allowClear = true,
  scroll = false,
  accessibilityLabel,
}: ChoiceChipsProps<V>) {
  const press = (v: V, selected: boolean) => onChange(selected && allowClear ? '' : v);
  const chips = options.map((o) => {
    const selected = o.value === value;
    return (
      <Chip
        key={String(o.value)}
        selected={selected}
        showSelectedCheck={false}
        selectedColor={selected ? palette.maroon : palette.ink}
        style={[styles.chip, selected && styles.selected]}
        accessibilityLabel={o.label}
        accessibilityState={{ selected }}
        onPress={() => press(o.value, selected)}
      >
        {o.label}
      </Chip>
    );
  });
  return scroll ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
    >
      {chips}
    </ScrollView>
  ) : (
    <View style={[styles.row, styles.wrap]} accessibilityLabel={accessibilityLabel}>
      {chips}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  chip: {
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.outline,
    minHeight: 40,
  },
  selected: { backgroundColor: palette.roseSoft, borderColor: palette.rose },
});
