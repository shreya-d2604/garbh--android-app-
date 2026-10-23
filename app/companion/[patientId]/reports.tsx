import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Card,
  EmptyState,
  palette,
  QueryBoundary,
  Screen,
  spacing,
  StatusChip,
} from '@/components';
import { SectionGate } from '@/features/companion/components/SectionGate';
import { formatCalendarDate } from '@/features/companion/format';
import { groupBy, labFlagTone, labValueText } from '@/features/companion/view';
import { useReports } from '@/features/companion/view-hooks';

/** Reports and their doctor-verified values (unverified values are hidden by RLS). */
function CompanionReportsContent({ patientId }: { patientId: string }) {
  const { t } = useTranslation('companion');
  const q = useReports(patientId, true);
  const byReport = groupBy(q.data?.results ?? [], (r) => r.report_id ?? '');

  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <QueryBoundary
        query={{ isPending: q.isPending, isError: q.isError, refetch: () => void q.refetch() }}
      >
        {q.data && q.data.reports.length === 0 ? (
          <EmptyState
            icon="flask-outline"
            title={t('reports.emptyTitle')}
            message={t('reports.emptyMessage')}
          />
        ) : null}
        {q.data?.reports.map((r) => {
          const values = byReport[r.id] ?? [];
          return (
            <Card
              key={r.id}
              title={r.title ?? t(`reportTypes.${r.type}`)}
              subtitle={[
                t(`reportTypes.${r.type}`),
                r.report_date ? formatCalendarDate(r.report_date) : null,
                r.lab_name,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                r.verified_at ? (
                  <StatusChip label={t('reports.reviewed')} tone="success" />
                ) : undefined
              }
            >
              {values.map((v) => {
                const text = labValueText(v);
                return (
                  <View
                    key={v.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      minHeight: 36,
                    }}
                  >
                    <Text variant="bodyMedium" style={{ flex: 1 }}>
                      {v.raw_name ?? v.test_code ?? ''}
                    </Text>
                    {text ? <Text variant="bodyMedium">{text}</Text> : null}
                    {v.flag ? (
                      <StatusChip label={t(`reports.flag.${v.flag}`)} tone={labFlagTone(v.flag)} />
                    ) : null}
                  </View>
                );
              })}
              {values.length === 0 ? (
                <Text variant="bodySmall" style={{ color: palette.inkMuted }}>
                  {t('reports.noValues')}
                </Text>
              ) : null}
              {r.doctor_comment ? <Text variant="bodyMedium">{r.doctor_comment}</Text> : null}
            </Card>
          );
        })}
      </QueryBoundary>
    </Screen>
  );
}

export default function CompanionReports() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  return (
    <SectionGate patientId={patientId} section="reports">
      <CompanionReportsContent patientId={patientId} />
    </SectionGate>
  );
}
