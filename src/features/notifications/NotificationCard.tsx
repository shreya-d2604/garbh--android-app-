import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Card, StatusChip, palette, spacing } from '@/components';

import type { NotificationRow } from './api';
import { notificationIcon, relativeTime } from './format';

export interface NotificationCardProps {
  item: NotificationRow;
  onPress: (item: NotificationRow) => void;
}

/** One inbox row. Unread rows are tinted and carry a "New" chip. */
export function NotificationCard({ item, onPress }: NotificationCardProps) {
  const { t } = useTranslation('backend');
  const unread = !item.read_at;
  return (
    <Card
      title={item.title}
      subtitle={relativeTime(item.created_at)}
      accessibilityLabel={item.title}
      variant={unread ? 'soft' : 'plain'}
      right={unread ? <StatusChip label={t('notifications.unread')} tone="primary" /> : undefined}
      onPress={() => onPress(item)}
    >
      <View style={styles.body}>
        <MaterialCommunityIcons
          name={notificationIcon(item.type)}
          size={20}
          color={palette.maroon}
        />
        {item.body ? (
          <Text variant="bodyMedium" style={styles.text}>
            {item.body}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  text: { flex: 1 },
});
