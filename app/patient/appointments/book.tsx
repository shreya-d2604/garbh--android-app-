import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { palette } from '@/components';
import { BookingFlow } from '@/features/patient/components/BookingFlow';
import { PatientGate } from '@/features/patient/components/PatientGate';

// Book next visit (PLAN.md §7.2 #3): /patient/appointments/book?visit=<id> pre-fills a planned
// visit; ?reschedule=<appointment id> moves an existing appointment.
export default function BookScreen() {
  const router = useRouter();
  const { visit, reschedule } = useLocalSearchParams<{ visit?: string; reschedule?: string }>();
  return (
    <View style={styles.fill}>
      <PatientGate>
        {(ctx) => (
          <BookingFlow
            ctx={ctx}
            mode={reschedule ? 'reschedule' : 'book'}
            visitId={visit}
            appointmentId={reschedule}
            onDone={(id) => router.replace(`/patient/appointments/${id}`)}
          />
        )}
      </PatientGate>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: palette.cream } });
