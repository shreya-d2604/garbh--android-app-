import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  InfoBanner,
  ListItem,
  SectionHeader,
  StatusChip,
  palette,
  spacing,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';

import { homeAlerts } from '../alerts';
import { splitAppointments } from '../appointments';
import { formatDate, formatStamp } from '../dates';
import { frequencyHint, todaysMedicines } from '../medicines';
import {
  useAppointments,
  useDoctorMap,
  usePrescriptionItems,
  usePublishedSummaries,
  useVisits,
} from '../hooks';
import { keyPoints, parseSummary } from '../summary';
import type { Appointment, PrescriptionItem } from '../types';
import { AppointmentCard } from './AppointmentCard';
import { InlineError, InlineLoading } from './Inline';

/** "OGTT due between 4 Mar and 18 Mar. Not booked yet." with a Book button (PLAN.md §7.2 #1). */
export function AlertsSection() {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const visits = useVisits();
  if (visits.isError) return <InlineError onRetry={() => void visits.refetch()} />;
  if (!visits.data) return null;
  const alerts = homeAlerts(visits.data, todayISO());
  if (alerts.length === 0) return null;
  return (
    <View style={styles.stack}>
      {alerts.map((a) => (
        <Card key={a.key} variant="plain">
          <InfoBanner
            tone={a.kind === 'visit_overdue' ? 'danger' : 'warning'}
            icon={a.kind === 'visit_overdue' ? 'alert-circle-outline' : 'calendar-alert'}
            message={t(a.kind === 'visit_overdue' ? 'alerts.overdue' : 'alerts.due', {
              title: a.title,
              from: a.dueFrom ? formatDate(a.dueFrom) : '',
              to: a.dueTo ? formatDate(a.dueTo) : '',
            })}
          />
          <Button
            label={t('alerts.book')}
            onPress={() => router.push(`/patient/appointments/book?visit=${a.visitId}`)}
          />
        </Card>
      ))}
    </View>
  );
}

function NextAppointmentCard({ appointments }: { appointments: Appointment[] }) {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const doctors = useDoctorMap();
  const next = splitAppointments(appointments, new Date()).upcoming[0];
  if (!next) {
    return (
      <Card>
        <Text variant="bodyMedium" style={styles.muted}>
          {t('home.noAppointment')}
        </Text>
        <Button
          label={t('home.bookVisit')}
          onPress={() => router.push('/patient/appointments/book')}
        />
      </Card>
    );
  }
  return (
    <AppointmentCard
      appointment={next}
      doctorName={doctors.get(next.doctor_id)?.full_name ?? null}
      variant="soft"
      onPress={() => router.push(`/patient/appointments/${next.id}`)}
    />
  );
}

/** Next appointment, live (the appointments query is invalidated by Realtime). */
export function NextAppointmentSection() {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const appointments = useAppointments();
  return (
    <View style={styles.stack}>
      <SectionHeader
        title={t('home.nextAppointment')}
        actionLabel={t('home.seeAll')}
        onAction={() => router.push('/patient/appointments')}
      />
      {appointments.isError ? (
        <InlineError onRetry={() => void appointments.refetch()} />
      ) : !appointments.data ? (
        <InlineLoading />
      ) : (
        <NextAppointmentCard appointments={appointments.data} />
      )}
    </View>
  );
}

/** Latest doctor-approved summary: headline and up to three key points. */
export function LatestSummarySection() {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const summaries = usePublishedSummaries();
  const doctors = useDoctorMap();
  const latest = summaries.data?.[0];
  const parsed = latest ? parseSummary(latest.final) : null;
  return (
    <View style={styles.stack}>
      <SectionHeader
        title={t('home.latestSummary')}
        actionLabel={t('home.seeAll')}
        onAction={() => router.push('/patient/reports')}
      />
      {summaries.isError ? (
        <InlineError onRetry={() => void summaries.refetch()} />
      ) : !summaries.data ? (
        <InlineLoading />
      ) : latest && parsed ? (
        <Card
          onPress={() => router.push(`/patient/reports/summaries/${latest.id}`)}
          title={parsed.headline || t('summary.untitled')}
          right={<StatusChip label={t('reports.doctorReviewed')} tone="success" />}
        >
          {keyPoints(parsed).map((point) => (
            <View key={point} style={styles.bullet}>
              <Text variant="bodyMedium" style={styles.dot}>
                •
              </Text>
              <Text variant="bodyMedium" style={styles.bulletText}>
                {point}
              </Text>
            </View>
          ))}
          <Text variant="bodySmall" style={styles.muted}>
            {[
              latest.reviewed_by && doctors.get(latest.reviewed_by)
                ? t('summary.reviewedBy', { name: doctors.get(latest.reviewed_by)?.full_name })
                : null,
              formatStamp(latest.published_at),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Card>
      ) : (
        <Card>
          <Text variant="bodyMedium" style={styles.muted}>
            {t('home.noSummary')}
          </Text>
        </Card>
      )}
    </View>
  );
}

function TodaysMedicinesList({ items }: { items: PrescriptionItem[] }) {
  const { t } = useTranslation('patient');
  const today = todaysMedicines(items, todayISO());
  if (today.length === 0) {
    return (
      <Card>
        <Text variant="bodyMedium" style={styles.muted}>
          {t('home.noMedicines')}
        </Text>
      </Card>
    );
  }
  return (
    <Card>
      {today.map((m) => {
        const hint = frequencyHint(m.frequency);
        return (
          <ListItem
            key={m.id}
            icon="pill"
            title={[m.drug_name, m.strength].filter(Boolean).join(' ')}
            description={[
              m.dose,
              m.frequency,
              hint ? hint.map((h) => t(`medicines.slot.${h}`)).join(', ') : null,
              m.timing,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        );
      })}
    </Card>
  );
}

/** Medicines to take today (active prescription items whose dates cover today). */
export function TodaysMedicinesSection() {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const items = usePrescriptionItems();
  return (
    <View style={styles.stack}>
      <SectionHeader
        title={t('home.todaysMedicines')}
        actionLabel={t('home.seeAll')}
        onAction={() => router.push('/patient/prescriptions')}
      />
      {items.isError ? (
        <InlineError onRetry={() => void items.refetch()} />
      ) : !items.data ? (
        <InlineLoading />
      ) : (
        <TodaysMedicinesList items={items.data} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  muted: { color: palette.inkMuted },
  bullet: { flexDirection: 'row', gap: spacing.sm },
  dot: { color: palette.rose },
  bulletText: { flex: 1, color: palette.ink },
});
