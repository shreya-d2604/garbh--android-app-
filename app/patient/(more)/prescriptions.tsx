import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Card,
  EmptyState,
  palette,
  QueryBoundary,
  Screen,
  SectionHeader,
  spacing,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import { MedicineRow } from '@/features/patient/components/MedicineRow';
import { PatientGate } from '@/features/patient/components/PatientGate';
import { formatStamp } from '@/features/patient/dates';
import { useGaLabel, usePlural } from '@/features/patient/format';
import { useDoctorMap, usePrescriptions, usePullToRefresh } from '@/features/patient/hooks';
import { todaysMedicines } from '@/features/patient/medicines';

function PrescriptionsContent() {
  const { t } = useTranslation('patient');
  const plural = usePlural();
  const gaLabel = useGaLabel();
  const query = usePrescriptions();
  const doctors = useDoctorMap();
  return (
    <QueryBoundary
      query={query}
      isEmpty={(d) => d.groups.length === 0 && d.items.length === 0}
      empty={
        <EmptyState
          icon="pill"
          title={t('medicines.emptyTitle')}
          message={t('medicines.emptyMessage')}
        />
      }
    >
      {(data) => {
        const current = todaysMedicines(data.items, todayISO());
        return (
          <>
            <SectionHeader title={t('medicines.current')} />
            {current.length === 0 ? (
              <Card>
                <Text variant="bodyMedium" style={styles.muted}>
                  {t('medicines.noneToday')}
                </Text>
              </Card>
            ) : (
              <Card>
                {current.map((m) => (
                  <MedicineRow key={m.id} item={m} />
                ))}
              </Card>
            )}

            <SectionHeader title={t('medicines.history')} />
            <View style={styles.stack}>
              {data.groups.map(({ consultation: c, items }) => (
                <Card
                  key={c.id}
                  title={formatStamp(c.published_at ?? c.created_at)}
                  subtitle={[
                    doctors.get(c.doctor_id)?.full_name,
                    c.ga_weeks != null ? gaLabel(c.ga_weeks, c.ga_days ?? 0) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  {items.map((m) => (
                    <MedicineRow key={m.id} item={m} showUntil={false} />
                  ))}
                  {c.advice ? (
                    <View style={styles.advice}>
                      <Text variant="labelLarge" style={styles.heading}>
                        {t('medicines.advice')}
                      </Text>
                      <Text variant="bodyMedium" style={styles.body}>
                        {c.advice}
                      </Text>
                    </View>
                  ) : null}
                  {c.diet_advice ? (
                    <View style={styles.advice}>
                      <Text variant="labelLarge" style={styles.heading}>
                        {t('medicines.dietAdvice')}
                      </Text>
                      <Text variant="bodyMedium" style={styles.body}>
                        {c.diet_advice}
                      </Text>
                    </View>
                  ) : null}
                  {c.next_visit_after_weeks != null ? (
                    <Text variant="bodySmall" style={styles.muted}>
                      {plural('medicines.nextVisit', c.next_visit_after_weeks)}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </View>
          </>
        );
      }}
    </QueryBoundary>
  );
}

// Prescriptions (PLAN.md §7.2 #7): current medicines, then history per published consultation.
export default function PrescriptionsScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>{() => <PrescriptionsContent />}</PatientGate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  advice: { gap: 2 },
  heading: { color: palette.maroon, fontWeight: '700' },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
});
