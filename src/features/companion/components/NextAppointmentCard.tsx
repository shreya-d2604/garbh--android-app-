import { ActivityIndicator, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { APPOINTMENT_STATUS_TONE, Card, ErrorState, palette, StatusChip } from '@/components';

import { formatDateTime } from '../format';
import { splitAppointments } from '../view';
import { useAppointments } from '../view-hooks';

interface Props {
  patientId: string;
  onPress?: () => void;
}

export function NextAppointmentCard({ patientId, onPress }: Props) {
  const { t } = useTranslation('companion');
  const { t: tc } = useTranslation();
  const appointments = useAppointments(patientId, true);

  if (appointments.isPending) {
    return (
      <Card title={t('appointments.next')}>
        <ActivityIndicator color={palette.rose} />
      </Card>
    );
  }
  if (appointments.isError) {
    return (
      <Card title={t('appointments.next')}>
        <ErrorState onRetry={() => void appointments.refetch()} />
      </Card>
    );
  }

  const next = splitAppointments(appointments.data).upcoming[0];
  return (
    <Card
      title={t('appointments.next')}
      onPress={onPress}
      accessibilityLabel={t('appointments.next')}
      right={
        next ? (
          <StatusChip
            label={tc(`status.${next.status}`)}
            tone={APPOINTMENT_STATUS_TONE[next.status]}
          />
        ) : undefined
      }
    >
      {next ? (
        <>
          <Text variant="titleMedium">{formatDateTime(next.starts_at)}</Text>
          {next.doctor_name ? (
            <Text variant="bodyMedium" style={{ color: palette.inkMuted }}>
              {next.doctor_name}
            </Text>
          ) : null}
        </>
      ) : (
        <Text variant="bodyMedium" style={{ color: palette.inkMuted }}>
          {t('appointments.noneUpcoming')}
        </Text>
      )}
    </Card>
  );
}
