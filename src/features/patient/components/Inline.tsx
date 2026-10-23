import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, palette, spacing } from '@/components';

/** Small loading placeholder for one section of a screen. */
export function InlineLoading() {
  const { t } = useTranslation();
  return (
    <View style={styles.row} accessibilityLabel={t('states.loading')}>
      <ActivityIndicator color={palette.rose} />
      <Text variant="bodyMedium" style={styles.muted}>
        {t('states.loading')}
      </Text>
    </View>
  );
}

/** Small error block for one section: the rest of the screen keeps working. */
export function InlineError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card>
      <View accessibilityRole="alert" style={styles.error}>
        <Text variant="bodyMedium" style={styles.muted}>
          {t('states.errorMessage')}
        </Text>
        <Button
          label={t('actions.retry')}
          variant="secondary"
          fullWidth={false}
          onPress={onRetry}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  error: { gap: spacing.sm },
  muted: { color: palette.inkMuted },
});
