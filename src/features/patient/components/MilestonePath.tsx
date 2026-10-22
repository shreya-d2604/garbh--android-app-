import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, StatusChip, palette, radius, spacing, type Tone } from '@/components';

import { formatDate } from '../dates';
import { useGaLabel } from '../format';
import type { PathNode, PathState } from '../journey';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const STATE_ICON: Record<PathState, { name: IconName; color: string }> = {
  done: { name: 'check-circle', color: palette.success },
  booked: { name: 'calendar-check', color: palette.info },
  current: { name: 'star-circle', color: palette.rose },
  upcoming: { name: 'circle-outline', color: palette.inkMuted },
  overdue: { name: 'alert-circle', color: palette.warning },
  missed: { name: 'close-circle', color: palette.danger },
  skipped: { name: 'minus-circle-outline', color: palette.inkMuted },
};

const STATE_TONE: Record<PathState, Tone> = {
  done: 'success',
  booked: 'info',
  current: 'primary',
  upcoming: 'neutral',
  overdue: 'warning',
  missed: 'danger',
  skipped: 'neutral',
};

/** "Due 4 Mar – 18 Mar" for visits, "Weeks 24–28" for scans and tests. */
export function useWindowText() {
  const { t } = useTranslation('patient');
  return (n: PathNode): string | null => {
    if (n.kind === 'visit' && n.dueFrom && n.dueTo) {
      return t('journey.dueWindow', { from: formatDate(n.dueFrom), to: formatDate(n.dueTo) });
    }
    if (n.weekFrom == null) return null;
    return n.weekTo != null && n.weekTo !== n.weekFrom
      ? t('journey.weekRange', { from: n.weekFrom, to: n.weekTo })
      : t('journey.weekSingle', { week: n.weekFrom });
  };
}

interface Props {
  nodes: PathNode[];
  weeks: number;
  days: number;
}

/** Vertical milestone path; tap a node for details and a Book / See appointment button. */
export function MilestonePath({ nodes, weeks, days }: Props) {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const gaLabel = useGaLabel();
  const windowText = useWindowText();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <View>
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1;
        if (n.kind === 'now') {
          return (
            <View key={n.key} style={styles.row} accessibilityLabel={t('journey.youAreHere')}>
              <View style={styles.rail}>
                <MaterialCommunityIcons name="map-marker" size={28} color={palette.maroon} />
                {last ? null : <View style={styles.line} />}
              </View>
              <View style={styles.nowPill}>
                <Text variant="labelLarge" style={styles.nowText}>
                  {t('journey.youAreHereAt', { label: gaLabel(weeks, days) })}
                </Text>
              </View>
            </View>
          );
        }
        const icon = STATE_ICON[n.state];
        const expanded = open === n.key;
        const win = windowText(n);
        const canBook =
          n.visitId != null &&
          n.appointmentId == null &&
          (n.state === 'current' || n.state === 'upcoming' || n.state === 'overdue');
        return (
          <View key={n.key} style={styles.row}>
            <View style={styles.rail}>
              <MaterialCommunityIcons name={icon.name} size={24} color={icon.color} />
              {last ? null : <View style={styles.line} />}
            </View>
            <Pressable
              style={styles.node}
              onPress={() => setOpen(expanded ? null : n.key)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={n.title}
            >
              <View style={styles.nodeHead}>
                <View style={styles.nodeTitles}>
                  <Text variant="bodyLarge" style={styles.nodeTitle}>
                    {n.title}
                  </Text>
                  {win ? (
                    <Text variant="bodySmall" style={styles.muted}>
                      {win}
                    </Text>
                  ) : null}
                </View>
                <StatusChip label={t(`journey.state.${n.state}`)} tone={STATE_TONE[n.state]} />
              </View>
              {expanded ? (
                <View style={styles.details}>
                  {n.description ? (
                    <Text variant="bodyMedium" style={styles.body}>
                      {n.description}
                    </Text>
                  ) : null}
                  {n.tests.length > 0 ? (
                    <Text variant="bodyMedium" style={styles.body}>
                      {t('journey.tests', { tests: n.tests.join(', ') })}
                    </Text>
                  ) : null}
                  {canBook ? (
                    <Button
                      label={t('journey.bookThis')}
                      onPress={() => router.push(`/patient/appointments/book?visit=${n.visitId}`)}
                    />
                  ) : null}
                  {n.state === 'booked' && n.appointmentId ? (
                    <Button
                      label={t('journey.seeAppointment')}
                      variant="secondary"
                      onPress={() => router.push(`/patient/appointments/${n.appointmentId}`)}
                    />
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  rail: { width: 32, alignItems: 'center' },
  line: { flex: 1, width: 2, backgroundColor: palette.outline, marginVertical: 2 },
  node: {
    flex: 1,
    backgroundColor: palette.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    minHeight: 48,
  },
  nodeHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  nodeTitles: { flex: 1, gap: 2 },
  nodeTitle: { color: palette.ink, fontWeight: '600' },
  details: { gap: spacing.sm },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
  nowPill: {
    flex: 1,
    alignSelf: 'center',
    backgroundColor: palette.maroon,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  nowText: { color: palette.white, fontWeight: '700' },
});
