import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button } from './Button';
import { palette, spacing } from './theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
}

/** Friendly "nothing here yet" block with an optional call to action. */
export function EmptyState({
  title,
  message,
  icon = 'flower-tulip-outline',
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.box}>
      <MaterialCommunityIcons name={icon} size={48} color={palette.rose} />
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {message ? (
        <Text variant="bodyMedium" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} fullWidth={false} />
      ) : null}
    </View>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

/** Error block. Never show raw error messages to users (no PHI in errors either). */
export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.box} accessibilityRole="alert">
      <MaterialCommunityIcons name="alert-circle-outline" size={48} color={palette.danger} />
      <Text variant="titleMedium" style={styles.title}>
        {title ?? t('states.errorTitle')}
      </Text>
      <Text variant="bodyMedium" style={styles.message}>
        {message ?? t('states.errorMessage')}
      </Text>
      {onRetry ? (
        <Button
          label={t('actions.retry')}
          variant="secondary"
          onPress={onRetry}
          fullWidth={false}
        />
      ) : null}
    </View>
  );
}

export interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  const { t } = useTranslation();
  return (
    <View style={[styles.box, styles.fill]} accessibilityLabel={message ?? t('states.loading')}>
      <ActivityIndicator size="large" color={palette.rose} />
      <Text variant="bodyMedium" style={styles.message}>
        {message ?? t('states.loading')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  fill: { flex: 1, backgroundColor: palette.cream },
  title: { color: palette.maroon, textAlign: 'center' },
  message: { color: palette.inkMuted, textAlign: 'center' },
});
