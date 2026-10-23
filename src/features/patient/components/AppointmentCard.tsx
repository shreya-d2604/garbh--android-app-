import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { APPOINTMENT_STATUS_TONE, Card, palette, StatusChip } from '@/components';

import { formatDay, formatTime } from '../dates';
import type { Appointment } from '../types';

interface Props {
  appointment: Appointment;
  doctorName: string | null;
  onPress?: () => void;
  variant?: 'plain' | 'soft';
  /** The doctor left her care team: show a calm "please rebook" line. */
  needsRebook?: boolean;
}

/** One appointment: day, time, doctor, a status chip and, if needed, a "please rebook" line. */
export function AppointmentCard({ appointment, doctorName, onPress, variant, needsRebook }: Props) {
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
      accessibilityLabel={[formatDay(appointment.starts_at), subtitle]
        .concat(needsRebook ? [tp('appointments.rebookCareTeam')] : [])
        .join(', ')}
    >
      {needsRebook ? (
        <Text variant="bodySmall" style={styles.rebook}>
          {tp('appointments.rebookCareTeam')}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({ rebook: { color: palette.maroon } });
