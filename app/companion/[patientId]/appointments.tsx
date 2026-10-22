import { useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  APPOINTMENT_STATUS_TONE,
  Card,
  EmptyState,
  palette,
  SectionHeader,
  StatusChip,
  Screen,
} from '@/components';
import { QueryBoundary } from '@/features/companion/components/QueryBoundary';
import { SectionGate } from '@/features/companion/components/SectionGate';
import { formatDateTime } from '@/features/companion/format';
import { splitAppointments } from '@/features/companion/view';
import { useAppointments } from '@/features/companion/view-hooks';

function CompanionAppointmentsContent({ patientId }: { patientId: string }) {
  const { t } = useTranslation('companion');
  const { t: tc } = useTranslation();
  const q = useAppointments(patientId, true);
  const { upcoming, past } = splitAppointments(q.data ?? []);

  const renderCard = (a: NonNullable<typeof q.data>[number]) => (
    <Card
      key={a.id}
      title={formatDateTime(a.starts_at)}
      subtitle={a.doctor_name ?? undefined}
      right={
        <StatusChip label={tc(`status.${a.status}`)} tone={APPOINTMENT_STATUS_TONE[a.status]} />
      }
    >
      {a.reason ? <Text variant="bodyMedium">{a.reason}</Text> : null}
      {a.notes_for_patient ? (
        <Text variant="bodySmall" style={{ color: palette.inkMuted }}>
          {a.notes_for_patient}
        </Text>
      ) : null}
    </Card>
  );

  return (
    <Screen edges={['bottom']} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <QueryBoundary isPending={q.isPending} isError={q.isError} onRetry={() => void q.refetch()}>
        {q.data && q.data.length === 0 ? (
          <EmptyState
            icon="calendar-blank-outline"
            title={t('appointments.emptyTitle')}
            message={t('appointments.emptyMessage')}
          />
        ) : (
          <>
            <SectionHeader title={t('appointments.upcoming')} />
            {upcoming.length > 0 ? (
              upcoming.map(renderCard)
            ) : (
              <Text variant="bodyMedium" style={{ color: palette.inkMuted }}>
                {t('appointments.noneUpcoming')}
              </Text>
            )}
            {past.length > 0 ? (
              <>
                <SectionHeader title={t('appointments.earlier')} />
                {past.map(renderCard)}
              </>
            ) : null}
          </>
        )}
      </QueryBoundary>
    </Screen>
  );
}

export default function CompanionAppointments() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  return (
    <SectionGate patientId={patientId} section="appointments">
      <CompanionAppointmentsContent patientId={patientId} />
    </SectionGate>
  );
}
