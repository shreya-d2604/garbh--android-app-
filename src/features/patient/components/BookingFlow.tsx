import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoBanner,
  LoadingState,
  Screen,
  SectionHeader,
  StatusChip,
  palette,
  radius,
  spacing,
} from '@/components';

import { ApiError, apiErrorKey } from '../api';
import { changeAllowance, splitAppointments, upcomingLimit } from '../appointments';
import {
  bookableDoctors,
  bookingReducer,
  groupSlotsByDay,
  initialBookingState,
  nextPlannedVisit,
  outsideVisitWindow,
} from '../booking';
import { formatDate, formatDayTime, formatTime } from '../dates';
import {
  useAppointments,
  useBookAppointment,
  useCareTeam,
  useDoctorDirectory,
  useRescheduleAppointment,
  useSlots,
  useVisits,
} from '../hooks';
import { todayISO } from '@/domain/pregnancy-math';
import type { ApptStatus, DoctorEntry, Visit } from '../types';
import { CallButton } from './CallButton';
import { DoctorAvatar } from './DoctorAvatar';
import type { ReadyContext } from './PatientGate';

export type BookingMode = 'book' | 'first' | 'reschedule';

interface FlowProps {
  ctx: ReadyContext;
  mode: BookingMode;
  /** `?visit=<id>`: the planned visit being booked. */
  visitId?: string;
  /** `?reschedule=<id>`: the appointment being moved. */
  appointmentId?: string;
  /** Called with the appointment id after a successful booking / reschedule. */
  onDone: (appointmentId: string) => void;
  /** First booking only: "Skip for now". */
  onSkip?: () => void;
}

/** Codes where the useful next step is to phone the hospital. */
const CALL_CODES = new Set(['NOT_IMPLEMENTED', 'CANCEL_CUTOFF', 'NOT_ALLOWED', 'MAX_UPCOMING']);

/**
 * Doctor -> day -> time -> confirm (PLAN.md §7.2 #3, §8.4). Loads what the form needs, then
 * hands over to BookingForm.
 */
export function BookingFlow(props: FlowProps) {
  const { t } = useTranslation('patient');
  const careTeam = useCareTeam();
  const directory = useDoctorDirectory();
  const visits = useVisits();
  const appointments = useAppointments();
  const all = [careTeam, directory, visits, appointments];

  const retry = () => {
    careTeam.refetch();
    void directory.refetch();
    void visits.refetch();
    void appointments.refetch();
  };
  if (all.some((q) => q.isError)) return <ErrorState onRetry={retry} />;
  if (
    all.some((q) => q.isLoading) ||
    !careTeam.data ||
    !directory.data ||
    !visits.data ||
    !appointments.data
  ) {
    return <LoadingState />;
  }

  const target = props.appointmentId
    ? appointments.data.find((a) => a.id === props.appointmentId)
    : undefined;
  if (props.mode === 'reschedule' && !target) {
    return <EmptyState icon="calendar-remove" title={t('appointments.notFound')} />;
  }
  // A first booking is the "booking visit" the desk links itself, so it is not tied to a plan visit.
  const visit =
    props.mode === 'first'
      ? null
      : props.mode === 'reschedule'
        ? (visits.data.find((v) => v.id === target?.visit_id) ?? null)
        : props.visitId
          ? (visits.data.find((v) => v.id === props.visitId) ?? null)
          : nextPlannedVisit(visits.data, todayISO());

  const doctors = bookableDoctors(careTeam.data, directory.data);
  const upcomingCount = splitAppointments(appointments.data, new Date()).upcoming.length;

  return (
    <BookingForm
      {...props}
      visit={visit}
      doctors={doctors}
      upcomingCount={upcomingCount}
      targetStartsAt={target?.starts_at ?? null}
      targetStatus={target?.status ?? null}
      targetDoctorId={target?.doctor_id ?? null}
    />
  );
}

interface FormProps extends FlowProps {
  visit: Visit | null;
  doctors: { doctor: DoctorEntry; role: 'primary' | 'backup' | null }[];
  upcomingCount: number;
  targetStartsAt: string | null;
  targetStatus: ApptStatus | null;
  targetDoctorId: string | null;
}

function BookingForm({
  ctx,
  mode,
  visit,
  doctors,
  upcomingCount,
  targetStartsAt,
  targetStatus,
  targetDoctorId,
  appointmentId,
  onDone,
  onSkip,
}: FormProps) {
  const { t } = useTranslation('patient');
  const { t: tc } = useTranslation();
  const book = useBookAppointment();
  const reschedule = useRescheduleAppointment();

  const defaultDoctor =
    (targetDoctorId && doctors.some((d) => d.doctor.id === targetDoctorId)
      ? targetDoctorId
      : doctors[0]?.doctor.id) ?? null;
  const [state, dispatch] = useReducer(bookingReducer, defaultDoctor, initialBookingState);

  const slotsQuery = useSlots(state.doctorId, ctx.settings.max_advance_days);
  const days = useMemo(() => groupSlotsByDay(slotsQuery.data ?? []), [slotsQuery.data]);
  const selectedDay = days.find((d) => d.key === state.dayKey);
  const chosenDoctor = doctors.find((d) => d.doctor.id === state.doctorId)?.doctor ?? null;

  // Start on the first day with free times, and recover when the chosen day disappears.
  useEffect(() => {
    const first = days[0];
    if (first && !days.some((d) => d.key === state.dayKey)) {
      dispatch({ type: 'selectDay', dayKey: first.key });
    }
  }, [days, state.dayKey]);

  // "That slot was just taken": re-fetch the slots so the taken one disappears.
  const { refetch } = slotsQuery;
  useEffect(() => {
    if (!state.needsRefresh) return;
    void refetch().finally(() => dispatch({ type: 'refreshed' }));
  }, [state.needsRefresh, refetch]);

  const confirm = useCallback(async () => {
    if (!state.slot || !state.doctorId) return;
    dispatch({ type: 'submit' });
    try {
      const id =
        mode === 'reschedule' && appointmentId
          ? await reschedule.mutateAsync({
              appointmentId,
              startsAt: state.slot.starts_at,
              doctorId: state.doctorId,
            })
          : await book.mutateAsync({
              doctorId: state.doctorId,
              startsAt: state.slot.starts_at,
              visitId: visit?.id ?? null,
              reason: visit?.title ?? null,
            });
      dispatch({ type: 'succeeded' });
      onDone(id);
    } catch (e) {
      dispatch({ type: 'failed', code: e instanceof ApiError ? e.code : null });
    }
  }, [state.slot, state.doctorId, mode, appointmentId, visit, book, reschedule, onDone]);

  const phone = ctx.settings.phone;

  // Reschedule is only possible until the cutoff (the server checks it too).
  if (mode === 'reschedule' && targetStartsAt && targetStatus) {
    const allowance = changeAllowance(
      { starts_at: targetStartsAt, status: targetStatus },
      new Date(),
      ctx.settings.patient_cancel_cutoff_hours,
    );
    if (!allowance.canChange) {
      return (
        <Screen edges={[]}>
          <InfoBanner tone="warning" message={tc('errors.CANCEL_CUTOFF')} />
          <CallButton phone={phone} label={t('common.callReception')} variant="primary" />
        </Screen>
      );
    }
  }

  if (doctors.length === 0) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="doctor"
          title={t('booking.noDoctorsTitle')}
          message={t('booking.noDoctorsMessage')}
        />
        <CallButton phone={phone} label={t('common.callReception')} />
        {onSkip ? <Button label={tc('actions.skip')} variant="text" onPress={onSkip} /> : null}
      </Screen>
    );
  }

  const limit = upcomingLimit(ctx.patient.is_verified === true, upcomingCount, ctx.settings);
  const limited = mode !== 'reschedule' && limit.reached;
  const warnOutside = state.slot ? outsideVisitWindow(state.slot.starts_at, visit) : false;
  const errorKey = state.errorCode ? `errors.${state.errorCode}` : null;
  const slotsError = slotsQuery.isError ? apiErrorKey(slotsQuery.error) : null;
  const showCall =
    (state.errorCode && CALL_CODES.has(state.errorCode)) || slotsError === 'errors.NOT_IMPLEMENTED';

  const footer = (
    <>
      {state.slot && chosenDoctor ? (
        <Text variant="titleSmall" style={styles.summary} accessibilityLiveRegion="polite">
          {t('booking.summary', {
            when: formatDayTime(state.slot.starts_at),
            doctor: chosenDoctor.full_name,
          })}
        </Text>
      ) : (
        <Text variant="bodyMedium" style={styles.muted}>
          {t('booking.pickTime')}
        </Text>
      )}
      <Button
        label={mode === 'reschedule' ? t('booking.confirmNew') : t('booking.confirm')}
        disabled={!state.slot || limited}
        loading={state.phase === 'submitting'}
        onPress={() => void confirm()}
      />
      {onSkip ? <Button label={tc('actions.skip')} variant="text" onPress={onSkip} /> : null}
    </>
  );

  return (
    <Screen edges={[]} footer={footer}>
      {visit ? (
        <Card variant="soft" title={t('booking.forVisit')}>
          <Text variant="titleMedium" style={styles.heading}>
            {visit.title}
          </Text>
          {visit.purpose ? (
            <Text variant="bodyMedium" style={styles.body}>
              {visit.purpose}
            </Text>
          ) : null}
          {visit.due_from && visit.due_to ? (
            <Text variant="bodySmall" style={styles.muted}>
              {t('journey.dueWindow', {
                from: formatDate(visit.due_from),
                to: formatDate(visit.due_to),
              })}
            </Text>
          ) : null}
        </Card>
      ) : mode === 'first' ? (
        <Text variant="bodyLarge" style={styles.body}>
          {t('booking.firstIntro')}
        </Text>
      ) : null}

      {mode === 'reschedule' && targetStartsAt ? (
        <InfoBanner
          tone="info"
          icon="calendar-clock"
          message={t('booking.currentVisit', { when: formatDayTime(targetStartsAt) })}
        />
      ) : null}
      {ctx.patient.is_verified ? null : (
        <InfoBanner icon="card-account-details-outline" message={tc('onboarding.verifyBanner')} />
      )}
      {limited ? (
        <InfoBanner
          tone="warning"
          message={t(
            limit.kind === 'unverified' ? 'booking.limitUnverified' : 'booking.limitVerified',
            {
              max: limit.max,
            },
          )}
        />
      ) : null}

      <SectionHeader title={t('booking.chooseDoctor')} />
      <View style={styles.stack}>
        {doctors.map(({ doctor, role }) => (
          <DoctorOption
            key={doctor.id}
            doctor={doctor}
            role={role}
            selected={doctor.id === state.doctorId}
            onPress={() => dispatch({ type: 'selectDoctor', doctorId: doctor.id })}
          />
        ))}
      </View>

      <SectionHeader title={t('booking.chooseDay')} />
      {slotsQuery.isLoading ? (
        <LoadingState message={t('booking.loadingTimes')} />
      ) : slotsError ? (
        <View style={styles.stack}>
          <InfoBanner tone="danger" message={tc(slotsError)} />
          <Button label={tc('actions.retry')} variant="secondary" onPress={() => void refetch()} />
        </View>
      ) : days.length === 0 ? (
        <View style={styles.stack}>
          <EmptyState
            icon="calendar-blank-outline"
            title={t('booking.noTimesTitle')}
            message={t('booking.noTimesMessage')}
          />
          <CallButton phone={phone} label={t('common.callReception')} />
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.days}
          >
            {days.map((d) => (
              <DayChip
                key={d.key}
                dayKey={d.key}
                count={d.slots.length}
                selected={d.key === state.dayKey}
                onPress={() => dispatch({ type: 'selectDay', dayKey: d.key })}
              />
            ))}
          </ScrollView>

          <SectionHeader title={t('booking.chooseTime')} />
          <View style={styles.times}>
            {(selectedDay?.slots ?? []).map((s) => {
              const selected = state.slot?.starts_at === s.starts_at;
              return (
                <Pressable
                  key={s.starts_at}
                  onPress={() => dispatch({ type: 'selectSlot', slot: s })}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={formatTime(s.starts_at)}
                  style={[styles.time, selected && styles.timeSelected]}
                >
                  <Text
                    variant="titleSmall"
                    style={[styles.timeText, selected && styles.timeTextSelected]}
                  >
                    {formatTime(s.starts_at)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {warnOutside && visit?.due_from && visit.due_to ? (
        <InfoBanner
          tone="warning"
          message={t('booking.outsideWindow', {
            from: formatDate(visit.due_from),
            to: formatDate(visit.due_to),
          })}
        />
      ) : null}
      {errorKey ? <InfoBanner tone="danger" message={tc(errorKey)} /> : null}
      {showCall ? <CallButton phone={phone} label={t('common.callReception')} /> : null}
    </Screen>
  );
}

function DoctorOption({
  doctor,
  role,
  selected,
  onPress,
}: {
  doctor: DoctorEntry;
  role: 'primary' | 'backup' | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation('patient');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={doctor.full_name}
      style={[styles.doctor, selected && styles.doctorSelected]}
    >
      <DoctorAvatar name={doctor.full_name} />
      <View style={styles.doctorTexts}>
        <Text variant="titleSmall" style={styles.heading}>
          {doctor.full_name}
        </Text>
        <Text variant="bodySmall" style={styles.muted}>
          {[doctor.designation, doctor.specialization].filter(Boolean).join(' · ')}
        </Text>
        {role ? (
          <StatusChip
            label={t(role === 'primary' ? 'doctors.primary' : 'doctors.backup')}
            tone={role === 'primary' ? 'primary' : 'neutral'}
          />
        ) : null}
      </View>
      <MaterialCommunityIcons
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={24}
        color={selected ? palette.rose : palette.inkMuted}
      />
    </Pressable>
  );
}

function DayChip({
  dayKey,
  count,
  selected,
  onPress,
}: {
  dayKey: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation('patient');
  const date = parseISO(dayKey);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t('booking.dayLabel', { day: format(date, 'EEEE d MMMM'), count })}
      style={[styles.day, selected && styles.daySelected]}
    >
      <Text variant="labelMedium" style={[styles.dayText, selected && styles.dayTextSelected]}>
        {format(date, 'EEE')}
      </Text>
      <Text variant="headlineSmall" style={[styles.dayText, selected && styles.dayTextSelected]}>
        {format(date, 'd')}
      </Text>
      <Text variant="labelSmall" style={[styles.dayText, selected && styles.dayTextSelected]}>
        {format(date, 'MMM')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  heading: { color: palette.maroon, fontWeight: '700' },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
  summary: { color: palette.maroon, fontWeight: '700' },
  doctor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: palette.outline,
    backgroundColor: palette.white,
    minHeight: 64,
  },
  doctorSelected: { borderColor: palette.rose, backgroundColor: palette.roseMist },
  doctorTexts: { flex: 1, gap: 2 },
  days: { gap: spacing.sm, paddingVertical: spacing.xs },
  day: {
    width: 68,
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.outline,
    backgroundColor: palette.white,
  },
  daySelected: { backgroundColor: palette.rose, borderColor: palette.rose },
  dayText: { color: palette.maroon },
  dayTextSelected: { color: palette.white },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  time: {
    minWidth: 96,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.rose,
    backgroundColor: palette.white,
  },
  timeSelected: { backgroundColor: palette.rose },
  timeText: { color: palette.rose, fontWeight: '600' },
  timeTextSelected: { color: palette.white },
});
