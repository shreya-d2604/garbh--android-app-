import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { APPOINTMENT_STATUS_TONE, Card, StatusChip, palette, spacing } from '@/components';

import type { DeskAppointment } from '../api';
import { formatTimeRange } from '../format';

export interface AppointmentCardProps {
  appointment: DeskAppointment;
  /** Shown next to the time; omit when the screen is already per doctor. */
  doctorName?: string;
  onPress?: () => void;
  /** Action buttons under the details. */
  children?: ReactNode;
}

/** One appointment: time, patient, status, "App" tag for online bookings. Used by desk, calendar and worklists. */
export function AppointmentCard({
  appointment: a,
  doctorName,
  onPress,
  children,
}: AppointmentCardProps) {
  const { t } = useTranslation('reception');
  const patient = a.patients;
  const subtitle = [formatTimeRange(a.starts_at, a.ends_at), doctorName]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card
      title={patient?.full_name ?? t('common.unknownPatient')}
      subtitle={subtitle}
      onPress={onPress}
      accessibilityLabel={`${patient?.full_name ?? ''} ${subtitle}`}
      right={
        <StatusChip
          label={t(`common:status.${a.status}`)}
          tone={APPOINTMENT_STATUS_TONE[a.status]}
        />
      }
    >
      <View style={styles.tags}>
        {a.booking_channel === 'app' ? <StatusChip label={t('tags.app')} tone="info" /> : null}
        {patient && !patient.verified_at ? (
          <StatusChip label={t('tags.unverified')} tone="warning" />
        ) : null}
        {patient?.mrn ? (
          <Text variant="bodySmall" style={styles.muted}>
            {t('common.mrn', { mrn: patient.mrn })}
          </Text>
        ) : null}
        {patient?.phone ? (
          <Text variant="bodySmall" style={styles.muted}>
            {patient.phone}
          </Text>
        ) : null}
      </View>
      {a.reason ? (
        <Text variant="bodySmall" style={styles.muted}>
          {a.reason}
        </Text>
      ) : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  muted: { color: palette.inkMuted },
});
