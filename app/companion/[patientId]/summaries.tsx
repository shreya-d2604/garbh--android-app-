import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Card,
  EmptyState,
  palette,
  SectionHeader,
  spacing,
  StatusChip,
  Screen,
} from '@/components';
import { QueryBoundary } from '@/features/companion/components/QueryBoundary';
import { SectionGate } from '@/features/companion/components/SectionGate';
import { formatDay } from '@/features/companion/format';
import { findingTone, summaryPreview } from '@/features/companion/view';
import { useSummaries } from '@/features/companion/view-hooks';

/** Doctor-approved summaries and the advice the doctor published after each visit. */
function CompanionSummariesContent({ patientId }: { patientId: string }) {
  const { t } = useTranslation('companion');
  const q = useSummaries(patientId, true);
  const summaries = q.data?.summaries ?? [];
  const advice = q.data?.consultations ?? [];

  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <QueryBoundary isPending={q.isPending} isError={q.isError} onRetry={() => void q.refetch()}>
        {summaries.length === 0 && advice.length === 0 ? (
          <EmptyState
            icon="text-box-check-outline"
            title={t('summaries.emptyTitle')}
            message={t('summaries.emptyMessage')}
          />
        ) : null}

        {summaries.length > 0 ? <SectionHeader title={t('summaries.reportSummaries')} /> : null}
        {summaries.map((s) => {
          const p = summaryPreview(s.final);
          if (!p) return null;
          return (
            <Card
              key={s.id}
              title={p.headline}
              subtitle={s.published_at ? formatDay(s.published_at) : undefined}
              right={<StatusChip label={t('summaries.reviewed')} tone="success" />}
            >
              {p.text ? <Text variant="bodyMedium">{p.text}</Text> : null}
              {p.findings.map((f) => (
                <View key={f.finding} style={{ gap: 2, marginTop: spacing.xs }}>
                  <StatusChip label={f.finding} tone={findingTone(f.status)} />
                  <Text variant="bodySmall" style={{ color: palette.inkMuted }}>
                    {f.explanation}
                  </Text>
                </View>
              ))}
              {p.lifestyleTips.length > 0 ? (
                <>
                  <Text variant="titleSmall">{t('summaries.tips')}</Text>
                  {p.lifestyleTips.map((tip) => (
                    <Text key={tip} variant="bodyMedium">
                      {`• ${tip}`}
                    </Text>
                  ))}
                </>
              ) : null}
            </Card>
          );
        })}

        {advice.length > 0 ? <SectionHeader title={t('summaries.doctorAdvice')} /> : null}
        {advice.map((c) => (
          <Card
            key={c.id}
            title={c.published_at ? formatDay(c.published_at) : t('summaries.doctorAdvice')}
          >
            {c.advice ? <Text variant="bodyMedium">{c.advice}</Text> : null}
            {c.diet_advice ? (
              <>
                <Text variant="titleSmall">{t('summaries.diet')}</Text>
                <Text variant="bodyMedium">{c.diet_advice}</Text>
              </>
            ) : null}
            {c.next_visit_after_weeks != null ? (
              <Text variant="bodySmall" style={{ color: palette.inkMuted }}>
                {t('summaries.nextVisit', { count: c.next_visit_after_weeks })}
              </Text>
            ) : null}
          </Card>
        ))}
      </QueryBoundary>
    </Screen>
  );
}

export default function CompanionSummaries() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  return (
    <SectionGate patientId={patientId} section="summaries">
      <CompanionSummariesContent patientId={patientId} />
    </SectionGate>
  );
}
