import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { palette, radius, spacing } from '@/components';
import type { GestationalAge } from '@/domain/pregnancy-math';

import { trimesterTimeline } from '../journey';

/** T1 -> T2 -> T3 -> Delivery with a "you are here" marker on the current bar. */
export function TrimesterTimeline({ ga }: { ga: GestationalAge }) {
  const { t } = useTranslation('patient');
  const segments = trimesterTimeline(ga);
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={t('journey.timeline')}
    >
      {segments.map((seg) => {
        const isDelivery = seg.key === 'delivery';
        return (
          <View key={seg.key} style={isDelivery ? styles.deliveryBox : styles.segment}>
            {isDelivery ? (
              <View
                style={[
                  styles.delivery,
                  seg.state === 'current' && { backgroundColor: palette.rose },
                ]}
              >
                <MaterialCommunityIcons
                  name="baby-carriage"
                  size={20}
                  color={seg.state === 'current' ? palette.white : palette.maroon}
                />
              </View>
            ) : (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(seg.fill * 100)}%` }]} />
                {seg.state === 'current' ? (
                  <View style={[styles.marker, { left: `${Math.round(seg.fill * 100)}%` }]} />
                ) : null}
              </View>
            )}
            <Text
              variant="labelMedium"
              style={[styles.label, seg.state === 'current' && styles.labelCurrent]}
            >
              {t(`timeline.${seg.key}`)}
            </Text>
            {seg.state === 'current' && !isDelivery ? (
              <Text variant="labelSmall" style={styles.here}>
                {t('journey.youAreHere')}
              </Text>
            ) : (
              <View style={styles.hereSpacer} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  segment: { flex: 1, gap: spacing.xs },
  deliveryBox: { alignItems: 'center', gap: spacing.xs },
  track: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: palette.roseSoft,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.pill,
    backgroundColor: palette.rose,
  },
  marker: {
    position: 'absolute',
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    borderWidth: 4,
    borderColor: palette.maroon,
  },
  delivery: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: palette.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: palette.inkMuted, textAlign: 'center' },
  labelCurrent: { color: palette.maroon, fontWeight: '700' },
  here: { color: palette.rose, textAlign: 'center', fontWeight: '700' },
  hereSpacer: { height: 16 },
});
