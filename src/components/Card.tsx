import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Card as PaperCard, Text } from 'react-native-paper';

import { palette, radius, spacing } from './theme';

export interface CardProps {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  /** Element shown at the right of the title row (e.g. a StatusChip). */
  right?: ReactNode;
  onPress?: () => void;
  /** 'soft' = rose-tinted highlight card (e.g. the journey card). */
  variant?: 'plain' | 'soft';
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/** Rounded content card. The building block of most screens. */
export function Card({
  children,
  title,
  subtitle,
  right,
  onPress,
  variant = 'plain',
  style,
  accessibilityLabel,
}: CardProps) {
  return (
    <PaperCard
      mode="contained"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, variant === 'soft' ? styles.soft : styles.plain, style]}
    >
      <View style={styles.inner}>
        {title || right ? (
          <View style={styles.titleRow}>
            <View style={styles.titles}>
              {title ? (
                <Text variant="titleMedium" style={styles.title}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text variant="bodySmall" style={styles.subtitle}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </View>
    </PaperCard>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1 },
  plain: { backgroundColor: palette.white, borderColor: palette.outline },
  soft: { backgroundColor: palette.roseMist, borderColor: palette.roseSoft },
  inner: { padding: spacing.md, gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titles: { flex: 1, gap: 2 },
  title: { color: palette.maroon, fontWeight: '600' },
  subtitle: { color: palette.inkMuted },
});
