import { StyleSheet, View } from 'react-native';
import { Button as PaperButton, Text } from 'react-native-paper';

import { palette, spacing } from './theme';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Heading above a group of cards, with an optional "See all"-style action. */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="titleMedium" style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <PaperButton mode="text" compact onPress={onAction} textColor={palette.rose}>
          {actionLabel}
        </PaperButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  title: { color: palette.maroon, fontWeight: '700' },
});
