import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, EmptyState, Screen, spacing } from '@/components';
import { splitAppointments } from '@/features/patient/appointments';
import { AppointmentCard } from '@/features/patient/components/AppointmentCard';
import { PatientGate } from '@/features/patient/components/PatientGate';
import { QueryBoundary } from '@/features/patient/components/QueryBoundary';
import { useAppointments, useDoctorMap, usePullToRefresh } from '@/features/patient/hooks';

type Tab = 'upcoming' | 'past';

function AppointmentsList() {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('upcoming');
  const appointments = useAppointments();
  const doctors = useDoctorMap();
  return (
    <>
      <Button
        label={t('appointments.bookVisit')}
        onPress={() => router.push('/patient/appointments/book')}
      />
      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        buttons={[
          { value: 'upcoming', label: t('appointments.upcoming') },
          { value: 'past', label: t('appointments.past') },
        ]}
      />
      <QueryBoundary query={appointments}>
        {(rows) => {
          const list = splitAppointments(rows, new Date())[tab];
          if (list.length === 0) {
            return (
              <EmptyState
                icon={tab === 'upcoming' ? 'calendar-blank-outline' : 'history'}
                title={t(tab === 'upcoming' ? 'appointments.noUpcoming' : 'appointments.noPast')}
                message={t(
                  tab === 'upcoming' ? 'appointments.noUpcomingHint' : 'appointments.noPastHint',
                )}
              />
            );
          }
          return (
            <View style={styles.stack}>
              {list.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  doctorName={doctors.get(a.doctor_id)?.full_name ?? null}
                  variant={tab === 'upcoming' ? 'soft' : 'plain'}
                  onPress={() => router.push(`/patient/appointments/${a.id}`)}
                />
              ))}
            </View>
          );
        }}
      </QueryBoundary>
    </>
  );
}

// Appointments (PLAN.md §7.2 #3): upcoming and past, live through Realtime.
export default function AppointmentsScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>{() => <AppointmentsList />}</PatientGate>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.sm } });
