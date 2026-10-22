import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Screen, palette } from '@/components';
import { AppointmentCard } from '@/features/reception/components/AppointmentCard';
import { QueryState } from '@/features/reception/components/QueryState';
import { formatDayTime } from '@/features/reception/format';
import { useDoctors, useDoctorUnavailable, useRefetchOnFocus } from '@/features/reception/hooks';

/** Doctor unavailable (PLAN.md §7.5 #6): appointments that fall inside a doctor's time off, to rebook. */
export default function DoctorUnavailable() {
  const { t } = useTranslation('reception');
  const router = useRouter();
  const affected = useDoctorUnavailable();
  const doctors = useDoctors();
  const names = useMemo(
    () => new Map((doctors.data ?? []).map((d) => [d.id, d.full_name])),
    [doctors.data],
  );
  useRefetchOnFocus(affected.refetch);

  return (
    <Screen
      edges={[]}
      title={t('unavailable.title')}
      subtitle={t('unavailable.subtitle')}
      refreshing={affected.isRefetching}
      onRefresh={() => void affected.refetch()}
    >
      <QueryState
        isPending={affected.isPending}
        isError={affected.isError}
        onRetry={() => void affected.refetch()}
        isEmpty={(affected.data ?? []).length === 0}
        emptyIcon="account-check-outline"
        emptyTitle={t('unavailable.emptyTitle')}
        emptyMessage={t('unavailable.emptyMessage')}
      >
        {(affected.data ?? []).map(({ appointment, timeOff }) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            doctorName={names.get(appointment.doctor_id)}
          >
            <Text variant="bodySmall" style={styles.reason}>
              {t('unavailable.offUntil', {
                doctor: names.get(appointment.doctor_id) ?? '',
                until: formatDayTime(timeOff.ends_at),
              })}
              {timeOff.reason ? ` (${timeOff.reason})` : ''}
            </Text>
            <Button
              label={t('unavailable.rebook')}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/reception/appointment',
                  params: { id: appointment.id, mode: 'reschedule' },
                })
              }
            />
          </AppointmentCard>
        ))}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({ reason: { color: palette.danger } });
