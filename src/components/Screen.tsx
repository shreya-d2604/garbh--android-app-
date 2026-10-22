import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { palette, spacing } from './theme';

export interface ScreenProps {
  children: ReactNode;
  /** Large heading at the top of the content. */
  title?: string;
  subtitle?: string;
  /** Wrap content in a ScrollView (default true). Use false for screens with their own FlatList. */
  scroll?: boolean;
  /** Pull-to-refresh (scroll screens only). */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Safe-area edges to pad. Screens inside a Tabs/Stack header usually want ['bottom'] or []. */
  edges?: Edge[];
  contentStyle?: ViewStyle;
  footer?: ReactNode;
}

/** Page container: cream background, safe area, consistent padding and spacing. */
export function Screen({
  children,
  title,
  subtitle,
  scroll = true,
  refreshing = false,
  onRefresh,
  edges = ['top', 'bottom'],
  contentStyle,
  footer,
}: ScreenProps) {
  const header = title ? (
    <View style={styles.header}>
      <Text variant="headlineSmall" style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="bodyMedium" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, contentStyle]}>
          {header}
          {children}
        </View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.cream },
  fill: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  header: { gap: spacing.xs, marginBottom: spacing.xs },
  title: { color: palette.maroon, fontWeight: '700' },
  subtitle: { color: palette.inkMuted },
  footer: { padding: spacing.md, gap: spacing.sm },
});
