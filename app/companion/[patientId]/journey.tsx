import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Card,
  EmptyState,
  ErrorState,
  ListItem,
  LoadingState,
  palette,
  Screen,
  SectionHeader,
  StatusChip,
} from '@/components';
import { gestationalAge, todayISO } from '@/domain/pregnancy-math';
import { GaCard } from '@/features/companion/components/GaCard';
import { SectionGate } from '@/features/companion/components/SectionGate';
import { formatCalendarDay } from '@/features/companion/format';
import { visitTone } from '@/features/companion/view';
import { useActivePregnancy, useVisits, useWeekContent } from '@/features/companion/view-hooks';

function CompanionJourneyContent({ patientId }: { patientId: string }) {
  const { t } = useTranslation('companion');
  const pregnancy = useActivePregnancy(patientId, true);
  const edd = pregnancy.data?.edd_final ?? null;
  const ga = edd ? gestationalAge(edd, todayISO()) : null;
  const week = useWeekContent(patientId, ga ? ga.weeks : null);
  const visits = useVisits(patientId, pregnancy.data?.id);

  const refresh = () => {
    void pregnancy.refetch();
    void visits.refetch();
    void week.refetch();
  };

  return (
    <Screen edges={['bottom']} refreshing={pregnancy.isRefetching} onRefresh={refresh}>
      <GaCard patientId={patientId} />

      {week.data ? (
        <Card title={t('journey.thisWeek', { week: week.data.week })}>
          {week.data.baby_length_cm != null || week.data.baby_weight_g != null ? (
            <Text variant="bodyMedium" style={styles.muted}>
              {[
                week.data.baby_length_cm != null
                  ? t('journey.length', { value: week.data.baby_length_cm })
                  : null,
                week.data.baby_weight_g != null
                  ? t('journey.weight', { value: week.data.baby_weight_g })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {week.data.baby_development ? (
            <Text variant="bodyMedium">{week.data.baby_development}</Text>
          ) : null}
          {week.data.mother_changes ? (
            <>
              <Text variant="titleSmall">{t('journey.motherChanges')}</Text>
              <Text variant="bodyMedium">{week.data.mother_changes}</Text>
            </>
          ) : null}
          {week.data.tips ? (
            <>
              <Text variant="titleSmall">{t('journey.tips')}</Text>
              <Text variant="bodyMedium">{week.data.tips}</Text>
            </>
          ) : null}
        </Card>
      ) : null}

      {pregnancy.data ? (
        <>
          <SectionHeader title={t('journey.visitPlan')} />
          {visits.isPending ? (
            <LoadingState />
          ) : visits.isError ? (
            <ErrorState onRetry={() => void visits.refetch()} />
          ) : visits.data.length === 0 ? (
            <EmptyState icon="calendar-blank-outline" title={t('journey.noVisits')} />
          ) : (
            <Card>
              {visits.data.map((v) => (
                <ListItem
                  key={v.id}
                  title={v.title}
                  description={[
                    t('journey.targetWeek', { week: v.target_week }),
                    v.due_from && v.due_to
                      ? `${formatCalendarDay(v.due_from)} – ${formatCalendarDay(v.due_to)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={
                    <StatusChip label={t(`visitStatus.${v.status}`)} tone={visitTone(v.status)} />
                  }
                />
              ))}
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ muted: { color: palette.inkMuted } });

export default function CompanionJourney() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  return (
    <SectionGate patientId={patientId} section="journey">
      <CompanionJourneyContent patientId={patientId} />
    </SectionGate>
  );
}
