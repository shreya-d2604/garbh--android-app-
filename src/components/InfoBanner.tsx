import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { radius, spacing, toneColors, type Tone } from './theme';

export interface InfoBannerProps {
  message: string;
  tone?: Exclude<Tone, 'neutral'>;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
}

/** Inline notice, e.g. "Bring a photo ID to your first visit to verify your account." */
export function InfoBanner({
  message,
  tone = 'info',
  icon = 'information-outline',
}: InfoBannerProps) {
  const c = toneColors[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg }]} accessibilityRole="alert">
      <MaterialCommunityIcons name={icon} size={20} color={c.fg} />
      <Text variant="bodyMedium" style={[styles.text, { color: c.fg }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  text: { flex: 1 },
});
