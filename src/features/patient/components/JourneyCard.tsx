import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Card, StatusChip, palette, spacing } from '@/components';

import { formatDateLong } from '../dates';
import { trimesterKey, useGaLabel, usePlural, withArticle } from '../format';
import type { JourneySnapshot } from '../journey';
import { ProgressRing } from './ProgressRing';
import type { ISODate } from '@/domain/pregnancy-math';

interface Props {
  snapshot: JourneySnapshot;
  edd: ISODate;
  babySize?: string | null;
  onPress?: () => void;
}

/** "Week 22 + 3 days · 2nd Trimester", progress ring to the due date, baby size, days to go. */
export function JourneyCard({ snapshot, edd, babySize, onPress }: Props) {
  const { t } = useTranslation('patient');
  const plural = usePlural();
  const gaLabel = useGaLabel();
  const { ga, daysToGo } = snapshot;
  const percent = Math.round(snapshot.progress * 100);

  const countdown =
    daysToGo > 0
      ? plural('journey.daysToGo', daysToGo)
      : daysToGo === 0
        ? t('journey.dueToday')
        : t('journey.dueDatePassed');

  return (
    <Card variant="soft" onPress={onPress} accessibilityLabel={gaLabel(ga.weeks, ga.days)}>
      <View style={styles.row}>
        <ProgressRing
          progress={snapshot.progress}
          accessibilityLabel={t('journey.progress', { percent })}
        >
          <Text variant="headlineMedium" style={styles.weeks}>
            {ga.weeks}
          </Text>
          <Text variant="labelSmall" style={styles.muted}>
            {t('journey.weeksUnit')}
          </Text>
        </ProgressRing>
        <View style={styles.texts}>
          <Text variant="titleMedium" style={styles.heading}>
            {gaLabel(ga.weeks, ga.days)}
          </Text>
          <StatusChip label={t(trimesterKey(ga))} tone="primary" />
          {babySize ? (
            <Text variant="bodyMedium" style={styles.body}>
              {t('journey.babySize', { size: withArticle(babySize) })}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.footer}>
        <Text variant="titleSmall" style={styles.heading}>
          {countdown}
        </Text>
        <Text variant="bodySmall" style={styles.muted}>
          {t('journey.dueOn', { date: formatDateLong(edd) })}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  texts: { flex: 1, gap: spacing.xs },
  weeks: { color: palette.maroon, fontWeight: '700' },
  heading: { color: palette.maroon, fontWeight: '700' },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
  footer: { gap: 2 },
});
