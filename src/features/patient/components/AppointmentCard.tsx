import { useTranslation } from 'react-i18next';

import { APPOINTMENT_STATUS_TONE, Card, StatusChip } from '@/components';

import { formatDay, formatTime } from '../dates';
import type { Appointment } from '../types';

interface Props {
  appointment: Appointment;
  doctorName: string | null;
  onPress?: () => void;
  variant?: 'plain' | 'soft';
}

/** One appointment: day, time, doctor and a status chip. */
export function AppointmentCard({ appointment, doctorName, onPress, variant }: Props) {
  const { t } = useTranslation();
  const { t: tp } = useTranslation('patient');
  const status = appointment.status;
  const subtitle = [
    formatTime(appointment.starts_at),
    doctorName ?? tp('appointments.yourDoctor'),
  ].join(' · ');
  return (
    <Card
      variant={variant}
      title={formatDay(appointment.starts_at)}
      subtitle={subtitle}
      right={<StatusChip label={t(`status.${status}`)} tone={APPOINTMENT_STATUS_TONE[status]} />}
      onPress={onPress}
      accessibilityLabel={`${formatDay(appointment.starts_at)}, ${subtitle}`}
    />
  );
}
