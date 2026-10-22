import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import { palette, spacing } from '@/components';

export interface ChoiceChipsProps<V extends string | number> {
  options: readonly { value: V; label: string }[];
  /** Selected value, or null/'' for none. */
  value: V | null | '';
  onChange: (value: V | '') => void;
  /** Tapping the selected chip clears it (default true). */
  allowClear?: boolean;
  /** One horizontally scrolling row instead of wrapping. */
  scroll?: boolean;
}

/** Single-choice chips used for exam findings, filters and tabs. */
export function ChoiceChips<V extends string | number>({
  options,
  value,
  onChange,
  allowClear = true,
  scroll = false,
}: ChoiceChipsProps<V>) {
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
        onPress={() => onChange(selected && allowClear ? '' : o.value)}
      >
        {o.label}
      </Chip>
    );
  });
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips}
    </ScrollView>
  ) : (
    <View style={[styles.row, styles.wrap]}>{chips}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  chip: { backgroundColor: palette.white, borderWidth: 1, borderColor: palette.outline },
  selected: { backgroundColor: palette.roseSoft, borderColor: palette.rose },
});
