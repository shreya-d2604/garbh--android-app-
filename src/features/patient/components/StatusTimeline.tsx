import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { palette, spacing } from '@/components';

import { statusTimeline } from '../appointments';
import type { ApptStatus } from '../types';

/** booked -> checked in -> with doctor -> done. Not shown for cancelled / missed visits. */
export function StatusTimeline({ status }: { status: ApptStatus }) {
  const { t } = useTranslation();
  const steps = statusTimeline(status);
  if (!steps) return null;
  return (
    <View style={styles.row} accessibilityLabel={t(`status.${status}`)}>
      {steps.map((s, i) => (
        <View key={s.key} style={styles.step}>
          <View style={styles.dotRow}>
            <View style={[styles.bar, i === 0 && styles.hidden]} />
            <MaterialCommunityIcons
              name={
                s.state === 'done'
                  ? 'check-circle'
                  : s.state === 'current'
                    ? 'record-circle'
                    : 'circle-outline'
              }
              size={26}
              color={s.state === 'todo' ? palette.outline : palette.rose}
            />
            <View style={[styles.bar, i === steps.length - 1 && styles.hidden]} />
          </View>
          <Text
            variant="labelSmall"
            style={[styles.label, s.state === 'current' && styles.current]}
            numberOfLines={2}
          >
            {t(`status.${s.key}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: spacing.xs },
  dotRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  bar: { flex: 1, height: 2, backgroundColor: palette.outline },
  hidden: { opacity: 0 },
  label: { color: palette.inkMuted, textAlign: 'center' },
  current: { color: palette.maroon, fontWeight: '700' },
});
