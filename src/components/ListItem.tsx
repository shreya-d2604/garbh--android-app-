import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { palette, radius, spacing } from './theme';

export interface ListItemProps {
  title: string;
  description?: string;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** Right-side content (e.g. a StatusChip). A chevron is shown when onPress is set and right is empty. */
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Tappable row inside lists and cards. */
export function ListItem({
  title,
  description,
  icon,
  right,
  onPress,
  accessibilityLabel,
}: ListItemProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {icon ? (
        <View style={styles.icon}>
          <MaterialCommunityIcons name={icon} size={22} color={palette.maroon} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text variant="bodyLarge" style={styles.title}>
          {title}
        </Text>
        {description ? (
          <Text variant="bodySmall" style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <MaterialCommunityIcons name="chevron-right" size={22} color={palette.inkMuted} />
        ) : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    minHeight: 48,
  },
  pressed: { backgroundColor: palette.roseMist },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: palette.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2 },
  title: { color: palette.ink },
  description: { color: palette.inkMuted },
});
