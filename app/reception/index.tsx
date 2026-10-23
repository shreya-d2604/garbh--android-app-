import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  ConfirmDialog,
  InfoBanner,
  ListItem,
  palette,
  Screen,
  SectionHeader,
  spacing,
  StatusChip,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import { rpcErrorKey } from '@/domain/rpc-errors';
import type { DeskAppointment } from '@/features/reception/api';
import { deskActions, summarizeDay } from '@/features/reception/calendar';
import { AppointmentCard } from '@/features/reception/components/AppointmentCard';
import { QueryState } from '@/features/reception/components/QueryState';
import { formatISODay } from '@/features/reception/format';
import {
  useDayAppointments,
  useDoctors,
  useDoctorUnavailable,
  useRefetchOnFocus,
  useSetAppointmentStatus,
  useVerifyQueue,
  useVisitsDue,
} from '@/features/reception/hooks';
import { useSession } from '@/lib/session';

/** Today's desk (PLAN.md §7.5 #5): check patients in, mark no-shows, and see what needs attention. */
export default function TodaysDesk() {
  const { t } = useTranslation('reception');
  const router = useRouter();
  const today = todayISO();
  const name = useSession((s) => s.profile?.full_name) ?? '';
  const appointments = useDayAppointments(today);
  const doctors = useDoctors();
  const verify = useVerifyQueue();
  const visitsDue = useVisitsDue();
  const unavailable = useDoctorUnavailable();
  const setStatus = useSetAppointmentStatus();
  const [noShow, setNoShow] = useState<DeskAppointment | null>(null);
  const [error, setError] = useState<string | null>(null);
  useRefetchOnFocus(unavailable.refetch);

  const doctorName = useMemo(
    () => new Map((doctors.data ?? []).map((d) => [d.id, d.full_name])),
    [doctors.data],
  );
  const summary = summarizeDay(appointments.data ?? []);

  async function change(
    appointment: DeskAppointment,
    status: 'checked_in' | 'confirmed' | 'no_show',
  ) {
    setError(null);
    try {
      await setStatus.mutateAsync({ appointment: appointment.id, status });
      setNoShow(null);
    } catch (e) {
      setNoShow(null);
      setError(rpcErrorKey(e as { message?: string; code?: string }));
    }
  }

  const refreshing = appointments.isRefetching;
  return (
    <Screen
      edges={[]}
      title={t('desk.hello', { name: name.split(' ')[0] || name })}
      subtitle={formatISODay(today)}
      refreshing={refreshing}
      onRefresh={() => {
        void appointments.refetch();
        void verify.refetch();
        void visitsDue.refetch();
        void unavailable.refetch();
      }}
    >
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}

      <Card variant="soft" title={t('desk.summary')}>
        <View style={styles.summary}>
          <SummaryNumber value={summary.waiting} label={t('desk.waiting')} />
          <SummaryNumber value={summary.checkedIn} label={t('desk.checkedIn')} />
          <SummaryNumber value={summary.withDoctor} label={t('desk.withDoctor')} />
          <SummaryNumber value={summary.done} label={t('desk.done')} />
        </View>
      </Card>

      <Card>
        <ListItem
          icon="shield-check-outline"
          title={t('desk.verifyLink')}
          description={t('desk.verifyHint')}
          right={
            <StatusChip
              label={String(verify.data?.length ?? 0)}
              tone={verify.data?.length ? 'warning' : 'neutral'}
            />
          }
          onPress={() => router.push('/reception/verify')}
        />
        <ListItem
          icon="clipboard-list-outline"
          title={t('desk.visitsLink')}
          description={t('desk.visitsHint')}
          right={
            <StatusChip
              label={String(visitsDue.data?.length ?? 0)}
              tone={visitsDue.data?.length ? 'info' : 'neutral'}
            />
          }
          onPress={() => router.push('/reception/visits')}
        />
        <ListItem
          icon="account-clock-outline"
          title={t('desk.unavailableLink')}
          description={t('desk.unavailableHint')}
          right={
            <StatusChip
              label={String(unavailable.data?.length ?? 0)}
              tone={unavailable.data?.length ? 'danger' : 'neutral'}
            />
          }
          onPress={() => router.push('/reception/unavailable')}
        />
      </Card>

      <SectionHeader title={t('desk.todayTitle')} />
      <QueryState
        isPending={appointments.isPending}
        isError={appointments.isError}
        onRetry={() => void appointments.refetch()}
        isEmpty={(appointments.data ?? []).length === 0}
        emptyIcon="calendar-blank-outline"
        emptyTitle={t('desk.emptyTitle')}
        emptyMessage={t('desk.emptyMessage')}
      >
        {(appointments.data ?? []).map((a) => {
          const actions = deskActions(a.status);
          return (
            <AppointmentCard
              key={a.id}
              appointment={a}
              doctorName={doctorName.get(a.doctor_id)}
              onPress={() =>
                router.push({ pathname: '/reception/appointment', params: { id: a.id } })
              }
            >
              {actions.length > 0 ? (
                <View style={styles.actions}>
                  {actions.includes('check_in') ? (
                    <Button
                      label={t('actions.checkIn')}
                      variant="secondary"
                      fullWidth={false}
                      loading={setStatus.isPending && setStatus.variables?.appointment === a.id}
                      onPress={() => void change(a, 'checked_in')}
                    />
                  ) : null}
                  {actions.includes('no_show') ? (
                    <Button
                      label={t('actions.noShow')}
                      variant="text"
                      onPress={() => setNoShow(a)}
                    />
                  ) : null}
                </View>
              ) : null}
            </AppointmentCard>
          );
        })}
      </QueryState>

      <Text variant="bodySmall" style={styles.muted}>
        {t('desk.liveHint')}
      </Text>

      <ConfirmDialog
        visible={noShow !== null}
        title={t('desk.noShowTitle')}
        message={t('desk.noShowMessage', { name: noShow?.patients?.full_name ?? '' })}
        confirmLabel={t('actions.noShow')}
        danger
        loading={setStatus.isPending}
        onDismiss={() => setNoShow(null)}
        onConfirm={() => noShow && void change(noShow, 'no_show')}
      />
    </Screen>
  );
}

function SummaryNumber({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.number} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="headlineSmall" style={styles.value}>
        {value}
      </Text>
      <Text variant="labelSmall" style={styles.muted}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', justifyContent: 'space-between' },
  number: { alignItems: 'center', flex: 1 },
  value: { color: palette.maroon, fontWeight: '700' },
  muted: { color: palette.inkMuted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
