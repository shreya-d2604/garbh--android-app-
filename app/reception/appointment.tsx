import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  ConfirmDialog,
  InfoBanner,
  palette,
  Screen,
  SectionHeader,
  spacing,
} from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import { deskActions } from '@/features/reception/calendar';
import { AppointmentCard } from '@/features/reception/components/AppointmentCard';
import { DoctorChips } from '@/features/reception/components/DoctorChips';
import { QueryState } from '@/features/reception/components/QueryState';
import { SlotPicker } from '@/features/reception/components/SlotPicker';
import { formatDayTime } from '@/features/reception/format';
import {
  useAppointment,
  useCancelAppointment,
  useDoctors,
  usePatientContext,
  useRescheduleAppointment,
  useSetAppointmentStatus,
} from '@/features/reception/hooks';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * One appointment: check in / confirm / no-show, reschedule (optionally with a backup doctor) and cancel.
 * `?mode=reschedule` opens the reschedule panel straight away (used by the doctor-unavailable worklist).
 */
export default function AppointmentScreen() {
  const { t } = useTranslation('reception');
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; mode?: string }>();
  const id = first(params.id);
  const appointment = useAppointment(id);
  const a = appointment.data;
  const doctors = useDoctors();
  const context = usePatientContext(a?.patient_id);
  const setStatus = useSetAppointmentStatus();
  const reschedule = useRescheduleAppointment();
  const cancel = useCancelAppointment();

  const [showReschedule, setShowReschedule] = useState(first(params.mode) === 'reschedule');
  const [newDoctor, setNewDoctor] = useState<string>();
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [noShow, setNoShow] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const doctorName = useMemo(
    () => new Map((doctors.data ?? []).map((d) => [d.id, d.full_name])),
    [doctors.data],
  );
  const teamDoctors = (doctors.data ?? []).filter((d) =>
    context.data?.careTeam.some((c) => c.doctor_id === d.id),
  );
  // A doctor who left the care team cannot take the new slot: preselect a care-team doctor.
  const currentOnTeam = teamDoctors.length === 0 || teamDoctors.some((d) => d.id === a?.doctor_id);
  const targetDoctor = newDoctor ?? (currentOnTeam ? a?.doctor_id : teamDoctors[0]?.id);
  const actions = a ? deskActions(a.status) : [];
  const fail = (e: unknown) => setError(rpcErrorKey(e as { message?: string; code?: string }));

  async function changeStatus(status: 'checked_in' | 'confirmed' | 'no_show') {
    if (!a) return;
    setError(null);
    try {
      await setStatus.mutateAsync({ appointment: a.id, status });
      setNoShow(false);
    } catch (e) {
      setNoShow(false);
      fail(e);
    }
  }

  async function move() {
    if (!a || !startsAt) return;
    setError(null);
    try {
      await reschedule.mutateAsync({
        appointment: a.id,
        startsAt,
        doctor: targetDoctor && targetDoctor !== a.doctor_id ? targetDoctor : undefined,
      });
      router.replace('/reception/calendar');
    } catch (e) {
      fail(e);
    }
  }

  async function doCancel() {
    if (!a) return;
    setError(null);
    try {
      await cancel.mutateAsync({ appointment: a.id, reason: reason.trim() });
      setCancelling(false);
      router.back();
    } catch (e) {
      setCancelling(false);
      fail(e);
    }
  }

  return (
    <Screen edges={[]} title={t('appointment.title')}>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <QueryState
        isPending={appointment.isPending}
        isError={appointment.isError}
        onRetry={() => void appointment.refetch()}
        isEmpty={!a}
        emptyIcon="calendar-remove"
        emptyTitle={t('appointment.notFound')}
      >
        {a ? (
          <>
            <AppointmentCard appointment={a} doctorName={doctorName.get(a.doctor_id)} />
            <Text variant="bodySmall" style={styles.muted}>
              {formatDayTime(a.starts_at)}
            </Text>

            {actions.length === 0 ? (
              <InfoBanner
                message={t('appointment.noActions', { status: t(`common:status.${a.status}`) })}
              />
            ) : (
              <View style={styles.actions}>
                {actions.includes('check_in') ? (
                  <Button
                    label={t('actions.checkIn')}
                    loading={setStatus.isPending}
                    onPress={() => void changeStatus('checked_in')}
                  />
                ) : null}
                {actions.includes('confirm') ? (
                  <Button
                    label={t('actions.confirm')}
                    variant="secondary"
                    disabled={setStatus.isPending}
                    onPress={() => void changeStatus('confirmed')}
                  />
                ) : null}
                {actions.includes('reschedule') ? (
                  <Button
                    label={
                      showReschedule ? t('appointment.hideReschedule') : t('actions.reschedule')
                    }
                    variant="secondary"
                    onPress={() => setShowReschedule(!showReschedule)}
                  />
                ) : null}
                {actions.includes('no_show') ? (
                  <Button
                    label={t('actions.noShow')}
                    variant="text"
                    onPress={() => setNoShow(true)}
                  />
                ) : null}
                {actions.includes('cancel') ? (
                  <Button
                    label={t('actions.cancelAppointment')}
                    variant="text"
                    onPress={() => setCancelling(true)}
                  />
                ) : null}
              </View>
            )}

            {showReschedule && actions.includes('reschedule') ? (
              <Card
                title={t('appointment.rescheduleTitle')}
                subtitle={t('appointment.rescheduleHint')}
              >
                <SectionHeader title={t('book.doctor')} />
                <QueryState
                  isPending={context.isPending || doctors.isPending}
                  isError={context.isError || doctors.isError}
                  onRetry={() => void context.refetch()}
                >
                  <DoctorChips
                    doctors={
                      teamDoctors.length > 0
                        ? teamDoctors
                        : (doctors.data ?? []).filter((d) => d.id === a.doctor_id)
                    }
                    selected={targetDoctor}
                    onSelect={(d) => {
                      setNewDoctor(d);
                      setStartsAt(null);
                    }}
                    suffix={(d) => (d === a.doctor_id ? t('appointment.current') : undefined)}
                  />
                </QueryState>
                <SectionHeader title={t('book.time')} />
                <SlotPicker doctorId={targetDoctor} selected={startsAt} onSelect={setStartsAt} />
                <Button
                  label={t('appointment.move')}
                  disabled={!startsAt}
                  loading={reschedule.isPending}
                  onPress={() => void move()}
                />
              </Card>
            ) : null}

            <ConfirmDialog
              visible={noShow}
              title={t('desk.noShowTitle')}
              message={t('desk.noShowMessage', { name: a.patients?.full_name ?? '' })}
              confirmLabel={t('actions.noShow')}
              danger
              loading={setStatus.isPending}
              onDismiss={() => setNoShow(false)}
              onConfirm={() => void changeStatus('no_show')}
            />
            <ConfirmDialog
              visible={cancelling}
              title={t('appointment.cancelTitle')}
              message={t('appointment.cancelMessage', { name: a.patients?.full_name ?? '' })}
              confirmLabel={t('actions.cancelAppointment')}
              danger
              loading={cancel.isPending}
              onDismiss={() => setCancelling(false)}
              onConfirm={() => void doCancel()}
            >
              <TextInput
                mode="outlined"
                label={t('appointment.cancelReason')}
                value={reason}
                onChangeText={setReason}
                maxLength={200}
                style={styles.input}
                accessibilityLabel={t('appointment.cancelReason')}
              />
            </ConfirmDialog>
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  muted: { color: palette.inkMuted },
  input: { backgroundColor: palette.white, marginTop: spacing.sm },
});
