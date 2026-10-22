import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  APPOINTMENT_STATUS_TONE,
  Button,
  Card,
  InfoBanner,
  Screen,
  StatusChip,
  palette,
  spacing,
} from '@/components';
import { apiErrorKey } from '@/features/patient/api';
import { changeAllowance } from '@/features/patient/appointments';
import { CallButton } from '@/features/patient/components/CallButton';
import { DoctorAvatar } from '@/features/patient/components/DoctorAvatar';
import { PatientGate, type ReadyContext } from '@/features/patient/components/PatientGate';
import { QueryBoundary } from '@/features/patient/components/QueryBoundary';
import { StatusTimeline } from '@/features/patient/components/StatusTimeline';
import { formatDay, formatTime } from '@/features/patient/dates';
import {
  useAppointment,
  useCancelAppointment,
  useDoctorMap,
  usePullToRefresh,
  useVisits,
} from '@/features/patient/hooks';

function AppointmentDetail({ id, ctx }: { id: string; ctx: ReadyContext }) {
  const { t } = useTranslation('patient');
  const { t: tc } = useTranslation();
  const router = useRouter();
  const appointment = useAppointment(id);
  const doctors = useDoctorMap();
  const visits = useVisits();
  const cancel = useCancelAppointment();
  const [dialog, setDialog] = useState(false);
  const [reason, setReason] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const doCancel = async () => {
    setErrorKey(null);
    try {
      await cancel.mutateAsync({
        appointmentId: id,
        reason: reason.trim() || t('appointments.defaultCancelReason'),
      });
      setDialog(false);
      setCancelled(true);
    } catch (e) {
      setDialog(false);
      setErrorKey(apiErrorKey(e));
    }
  };

  return (
    <QueryBoundary query={appointment}>
      {(a) => {
        const doctor = doctors.get(a.doctor_id);
        const visit = visits.data?.find((v) => v.id === a.visit_id);
        const allowance = changeAllowance(a, new Date(), ctx.settings.patient_cancel_cutoff_hours);
        const active = a.status === 'booked' || a.status === 'confirmed';
        return (
          <>
            <Card
              variant="soft"
              title={formatDay(a.starts_at)}
              subtitle={`${formatTime(a.starts_at)} – ${formatTime(a.ends_at)}`}
              right={
                <StatusChip
                  label={tc(`status.${a.status}`)}
                  tone={APPOINTMENT_STATUS_TONE[a.status]}
                />
              }
            >
              <View style={styles.doctor}>
                <DoctorAvatar name={doctor?.full_name ?? t('appointments.yourDoctor')} />
                <View style={styles.doctorTexts}>
                  <Text variant="titleSmall" style={styles.heading}>
                    {doctor?.full_name ?? t('appointments.yourDoctor')}
                  </Text>
                  {doctor?.specialization ? (
                    <Text variant="bodySmall" style={styles.muted}>
                      {doctor.specialization}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>

            {a.status === 'cancelled' || a.status === 'no_show' ? (
              <InfoBanner
                tone={a.status === 'cancelled' ? 'info' : 'warning'}
                message={t(
                  a.status === 'cancelled' ? 'appointments.wasCancelled' : 'appointments.wasMissed',
                )}
              />
            ) : (
              <Card title={t('appointments.progress')}>
                <StatusTimeline status={a.status} />
              </Card>
            )}
            {cancelled ? (
              <InfoBanner tone="success" message={t('appointments.cancelledOk')} />
            ) : null}
            {errorKey ? <InfoBanner tone="danger" message={tc(errorKey)} /> : null}

            <Card title={t('appointments.details')}>
              {visit ? (
                <Text variant="bodyMedium" style={styles.body}>
                  {t('appointments.forVisit', { title: visit.title })}
                </Text>
              ) : null}
              {a.reason && a.reason !== visit?.title ? (
                <Text variant="bodyMedium" style={styles.body}>
                  {t('appointments.reason', { reason: a.reason })}
                </Text>
              ) : null}
              {a.notes_for_patient ? (
                <Text variant="bodyMedium" style={styles.body}>
                  {t('appointments.note', { note: a.notes_for_patient })}
                </Text>
              ) : null}
              <Text variant="bodyMedium" style={styles.body}>
                {[ctx.settings.name, ctx.settings.address].filter(Boolean).join(', ')}
              </Text>
            </Card>

            {active && allowance.canChange ? (
              <View style={styles.stack}>
                <Button
                  label={t('appointments.reschedule')}
                  onPress={() => router.push(`/patient/appointments/book?reschedule=${a.id}`)}
                />
                <Button
                  label={t('appointments.cancel')}
                  variant="danger"
                  onPress={() => setDialog(true)}
                />
                <Text variant="bodySmall" style={styles.muted}>
                  {t('appointments.cutoffHint', {
                    hours: ctx.settings.patient_cancel_cutoff_hours,
                  })}
                </Text>
              </View>
            ) : null}
            {active && allowance.blocked === 'cutoff' ? (
              <View style={styles.stack}>
                <InfoBanner tone="warning" message={t('appointments.callToChange')} />
                <CallButton
                  phone={ctx.settings.phone}
                  label={t('common.callReception')}
                  variant="primary"
                />
              </View>
            ) : null}
            {a.status === 'cancelled' || a.status === 'no_show' ? (
              <Button
                label={t('appointments.bookAgain')}
                onPress={() =>
                  router.push(
                    a.visit_id
                      ? `/patient/appointments/book?visit=${a.visit_id}`
                      : '/patient/appointments/book',
                  )
                }
              />
            ) : null}

            <Portal>
              <Dialog visible={dialog} onDismiss={() => setDialog(false)}>
                <Dialog.Title>{t('appointments.cancelTitle')}</Dialog.Title>
                <Dialog.Content style={styles.stack}>
                  <Text variant="bodyMedium">{t('appointments.cancelMessage')}</Text>
                  <TextInput
                    mode="outlined"
                    label={t('appointments.cancelReason')}
                    value={reason}
                    onChangeText={setReason}
                    maxLength={200}
                  />
                </Dialog.Content>
                <Dialog.Actions>
                  <Button
                    label={t('appointments.keep')}
                    variant="text"
                    onPress={() => setDialog(false)}
                  />
                  <Button
                    label={t('appointments.confirmCancel')}
                    variant="text"
                    loading={cancel.isPending}
                    onPress={() => void doCancel()}
                  />
                </Dialog.Actions>
              </Dialog>
            </Portal>
          </>
        );
      }}
    </QueryBoundary>
  );
}

// Appointment detail: status timeline, reschedule / cancel until the cutoff, then "call reception".
export default function AppointmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>{(ctx) => <AppointmentDetail id={id} ctx={ctx} />}</PatientGate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  doctor: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  doctorTexts: { flex: 1 },
  heading: { color: palette.maroon, fontWeight: '700' },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
});
