import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Card, palette, spacing } from '@/components';

import type { PathNode } from '../journey';
import { useWindowText } from './MilestonePath';

/** The next few stages in plain language. */
export function WhatsNext({ nodes }: { nodes: PathNode[] }) {
  const { t } = useTranslation('patient');
  const windowText = useWindowText();
  if (nodes.length === 0) {
    return (
      <Card>
        <Text variant="bodyMedium" style={styles.muted}>
          {t('journey.nothingNext')}
        </Text>
      </Card>
    );
  }
  return (
    <View style={styles.stack}>
      {nodes.map((n) => (
        <Card key={n.key} title={n.title} subtitle={windowText(n) ?? undefined}>
          {n.description ? (
            <Text variant="bodyMedium" style={styles.body}>
              {n.description}
            </Text>
          ) : null}
          {n.tests.length > 0 ? (
            <Text variant="bodySmall" style={styles.muted}>
              {t('journey.tests', { tests: n.tests.join(', ') })}
            </Text>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
});
