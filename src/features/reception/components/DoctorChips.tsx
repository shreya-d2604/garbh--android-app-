import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';

import { palette, spacing } from '@/components';

import type { Doctor } from '../api';

export interface DoctorChipsProps {
  doctors: readonly Pick<Doctor, 'id' | 'full_name'>[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  /** Extra text after a doctor's name, e.g. "Primary". */
  suffix?: (id: string) => string | undefined;
}

/** Single-select row of doctors. */
export function DoctorChips({ doctors, selected, onSelect, suffix }: DoctorChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {doctors.map((d) => {
        const extra = suffix?.(d.id);
        return (
          <Chip
            key={d.id}
            selected={d.id === selected}
            showSelectedOverlay
            onPress={() => onSelect(d.id)}
            mode="outlined"
            style={[styles.chip, d.id === selected && styles.selected]}
            accessibilityLabel={d.full_name}
          >
            {extra ? `${d.full_name} · ${extra}` : d.full_name}
          </Chip>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    borderColor: palette.outline,
    backgroundColor: palette.white,
  },
  selected: { backgroundColor: palette.roseSoft, borderColor: palette.rose },
});
