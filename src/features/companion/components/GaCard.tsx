import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, ProgressBar, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Card, EmptyState, ErrorState, palette, spacing, StatusChip } from '@/components';
import { gestationalAge, progressToEdd, todayISO } from '@/domain/pregnancy-math';

import { formatCalendarDate } from '../format';
import { useActivePregnancy, useWeekContent } from '../view-hooks';

interface Props {
  patientId: string;
  onPress?: () => void;
}

/** "Week 22 + 3 days . 2nd trimester" with progress to the due date. Needs the journey permission. */
export function GaCard({ patientId, onPress }: Props) {
  const { t } = useTranslation('companion');
  const pregnancy = useActivePregnancy(patientId, true);
  const edd = pregnancy.data?.edd_final ?? null;
  const ga = edd ? gestationalAge(edd, todayISO()) : null;
  const week = useWeekContent(patientId, ga ? ga.weeks : null);

  if (pregnancy.isPending) {
    return (
      <Card variant="soft">
        <ActivityIndicator color={palette.rose} />
      </Card>
    );
  }
  if (pregnancy.isError) {
    return (
      <Card>
        <ErrorState onRetry={() => void pregnancy.refetch()} />
      </Card>
    );
  }
  if (!ga || !edd) {
    return (
      <Card>
        <EmptyState icon="human-pregnant" title={t('journey.noPregnancy')} />
      </Card>
    );
  }

  const size = week.data?.baby_size_label;
  return (
    <Card variant="soft" onPress={onPress} accessibilityLabel={t('journey.cardLabel')}>
      <View style={styles.top}>
        <Text variant="headlineSmall" style={styles.headline}>
          {t('journey.weekDay', { weeks: ga.weeks, days: ga.days })}
        </Text>
        <StatusChip label={t(`journey.trimester.${ga.trimester}`)} tone="primary" />
      </View>
      <ProgressBar progress={progressToEdd(ga)} color={palette.rose} style={styles.bar} />
      <Text variant="bodyMedium" style={styles.muted}>
        {ga.daysToEdd >= 0
          ? t('journey.daysToGo', { count: ga.daysToEdd, date: formatCalendarDate(edd) })
          : t('journey.pastDue', { date: formatCalendarDate(edd) })}
      </Text>
      {size ? (
        <Text variant="bodyMedium" style={styles.size}>
          {t('journey.babySize', { size: size.toLowerCase() })}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headline: { color: palette.maroon, fontWeight: '700', flexShrink: 1 },
  bar: { height: 8, borderRadius: 4, backgroundColor: palette.white },
  muted: { color: palette.inkMuted },
  size: { color: palette.ink },
});
