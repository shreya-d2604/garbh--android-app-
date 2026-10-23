import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  EmptyState,
  palette,
  QueryBoundary,
  Screen,
  spacing,
  StatusChip,
} from '@/components';
import { orderedCareTeam } from '@/features/patient/booking';
import { DoctorAvatar } from '@/features/patient/components/DoctorAvatar';
import { PatientGate } from '@/features/patient/components/PatientGate';
import { useCareTeam, usePullToRefresh } from '@/features/patient/hooks';

function CareTeamList() {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const team = useCareTeam();
  return (
    <QueryBoundary
      query={team}
      isEmpty={(members) => members.length === 0}
      empty={
        <EmptyState
          icon="doctor"
          title={t('doctors.emptyTitle')}
          message={t('doctors.emptyMessage')}
          actionLabel={t('doctors.bookFirst')}
          onAction={() => router.push('/patient/first-booking')}
        />
      }
    >
      {(members) => (
        <>
          <View style={styles.stack}>
            {orderedCareTeam(members).map((m) => (
              <Card
                key={m.id}
                right={
                  <StatusChip
                    label={t(m.care_role === 'primary' ? 'doctors.primary' : 'doctors.backup')}
                    tone={m.care_role === 'primary' ? 'primary' : 'neutral'}
                  />
                }
              >
                <View style={styles.row}>
                  <DoctorAvatar
                    name={m.doctor?.full_name ?? t('appointments.yourDoctor')}
                    size={56}
                  />
                  <View style={styles.texts}>
                    <Text variant="titleMedium" style={styles.name}>
                      {m.doctor?.full_name ?? t('appointments.yourDoctor')}
                    </Text>
                    <Text variant="bodySmall" style={styles.muted}>
                      {[m.doctor?.designation, m.doctor?.specialization]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>
                {m.doctor?.bio ? (
                  <Text variant="bodyMedium" style={styles.body}>
                    {m.doctor.bio}
                  </Text>
                ) : null}
                {m.note ? (
                  <Text variant="bodySmall" style={styles.muted}>
                    {m.note}
                  </Text>
                ) : null}
              </Card>
            ))}
          </View>
          <Button
            label={t('doctors.bookVisit')}
            onPress={() => router.push('/patient/appointments/book')}
          />
        </>
      )}
    </QueryBoundary>
  );
}

// My doctors (PLAN.md §7.2 #4): the active care team, primary first.
export default function DoctorsScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>{() => <CareTeamList />}</PatientGate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  texts: { flex: 1, gap: 2 },
  name: { color: palette.maroon, fontWeight: '700' },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
});
