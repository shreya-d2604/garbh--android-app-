import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { palette } from '@/components';
import { BookingFlow } from '@/features/patient/components/BookingFlow';
import { PatientGate } from '@/features/patient/components/PatientGate';

// "Book your first visit" (PLAN.md §7.1, §8.3): reached right after onboarding. Pick a doctor
// who accepts new patients, then a time. "Skip for now" goes to Home, where the verify banner
// and a Book button wait.
export default function FirstBooking() {
  const router = useRouter();
  return (
    <View style={styles.fill}>
      <PatientGate>
        {(ctx) => (
          <BookingFlow
            ctx={ctx}
            mode="first"
            onDone={() => router.replace('/patient')}
            onSkip={() => router.replace('/patient')}
          />
        )}
      </PatientGate>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: palette.cream } });
