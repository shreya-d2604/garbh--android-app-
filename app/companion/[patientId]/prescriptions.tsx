import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Card, EmptyState, palette, SectionHeader, Screen } from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import { QueryBoundary } from '@/features/companion/components/QueryBoundary';
import { SectionGate } from '@/features/companion/components/SectionGate';
import { formatCalendarDate } from '@/features/companion/format';
import { splitPrescriptions } from '@/features/companion/view';
import { usePrescriptions } from '@/features/companion/view-hooks';

function CompanionPrescriptionsContent({ patientId }: { patientId: string }) {
  const { t } = useTranslation('companion');
  const q = usePrescriptions(patientId, true);
  const { current, past } = splitPrescriptions(q.data ?? [], todayISO());

  const renderItem = (i: NonNullable<typeof q.data>[number]) => (
    <Card
      key={i.id}
      title={[i.drug_name, i.strength].filter(Boolean).join(' ')}
      subtitle={[i.dosage_form, i.route].filter(Boolean).join(' · ') || undefined}
    >
      <Text variant="bodyMedium">
        {[i.dose, i.frequency, i.timing].filter(Boolean).join(' · ') || t('prescriptions.noDose')}
      </Text>
      {i.duration_days != null || i.end_date ? (
        <Text variant="bodySmall" style={{ color: palette.inkMuted }}>
          {[
            i.duration_days != null ? t('prescriptions.days', { count: i.duration_days }) : null,
            i.end_date ? t('prescriptions.until', { date: formatCalendarDate(i.end_date) }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      {i.instructions ? <Text variant="bodyMedium">{i.instructions}</Text> : null}
    </Card>
  );

  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <QueryBoundary isPending={q.isPending} isError={q.isError} onRetry={() => void q.refetch()}>
        {q.data && q.data.length === 0 ? (
          <EmptyState
            icon="pill"
            title={t('prescriptions.emptyTitle')}
            message={t('prescriptions.emptyMessage')}
          />
        ) : (
          <>
            <SectionHeader title={t('prescriptions.current')} />
            {current.length > 0 ? (
              current.map(renderItem)
            ) : (
              <Text variant="bodyMedium" style={{ color: palette.inkMuted }}>
                {t('prescriptions.noneCurrent')}
              </Text>
            )}
            {past.length > 0 ? (
              <>
                <SectionHeader title={t('prescriptions.earlier')} />
                {past.map(renderItem)}
              </>
            ) : null}
          </>
        )}
      </QueryBoundary>
    </Screen>
  );
}

export default function CompanionPrescriptions() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  return (
    <SectionGate patientId={patientId} section="prescriptions">
      <CompanionPrescriptionsContent patientId={patientId} />
    </SectionGate>
  );
}
