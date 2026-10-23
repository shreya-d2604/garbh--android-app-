import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, IconButton, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, ErrorState, LoadingState, Screen, palette, spacing } from '@/components';
import { addDays, todayISO, type ISODate } from '@/domain/pregnancy-math';
import { buildDayTimeline, weekDates } from '@/features/reception/calendar';
import { AppointmentCard } from '@/features/reception/components/AppointmentCard';
import { DoctorChips } from '@/features/reception/components/DoctorChips';
import { formatISODay, formatTimeRange } from '@/features/reception/format';
import { useDayAppointments, useDoctors, useFreeSlots } from '@/features/reception/hooks';

/** Appointment book (PLAN.md §7.5 #3): one doctor, one day. Online bookings arrive live, tagged "App". */
export default function CalendarScreen() {
  const { t } = useTranslation('reception');
  const router = useRouter();
  const today = todayISO();
  const [date, setDate] = useState<ISODate>(today);
  const [pickedDoctor, setDoctorId] = useState<string>();
  const doctors = useDoctors();
  const doctorId = pickedDoctor ?? doctors.data?.[0]?.id;

  const appointments = useDayAppointments(date, doctorId);
  const slots = useFreeSlots(doctorId, date, date);
  const timeline = useMemo(
    () => buildDayTimeline(slots.data ?? [], appointments.data ?? []),
    [slots.data, appointments.data],
  );
  const week = weekDates(date);
  const pending = doctors.isPending || (!!doctorId && (appointments.isPending || slots.isPending));
  const failed = doctors.isError || appointments.isError || slots.isError;

  return (
    <Screen
      edges={[]}
      title={t('calendar.title')}
      subtitle={formatISODay(date)}
      refreshing={appointments.isRefetching}
      onRefresh={() => {
        void appointments.refetch();
        void slots.refetch();
      }}
    >
      <Button
        label={t('calendar.bookNew')}
        onPress={() =>
          router.push({ pathname: '/reception/book', params: doctorId ? { doctor: doctorId } : {} })
        }
      />

      {doctors.data ? (
        <DoctorChips doctors={doctors.data} selected={doctorId} onSelect={setDoctorId} />
      ) : null}

      <View style={styles.weekRow}>
        <IconButton
          icon="chevron-left"
          accessibilityLabel={t('calendar.prevWeek')}
          onPress={() => setDate(addDays(date, -7))}
        />
        <View style={styles.days}>
          {week.map((d) => (
            <Chip
              key={d}
              compact
              mode="outlined"
              selected={d === date}
              onPress={() => setDate(d)}
              style={[styles.day, d === date && styles.selected, d === today && styles.today]}
              accessibilityLabel={formatISODay(d)}
            >
              {formatISODay(d).slice(0, 6)}
            </Chip>
          ))}
        </View>
        <IconButton
          icon="chevron-right"
          accessibilityLabel={t('calendar.nextWeek')}
          onPress={() => setDate(addDays(date, 7))}
        />
      </View>
      {date !== today ? (
        <Button label={t('calendar.backToToday')} variant="text" onPress={() => setDate(today)} />
      ) : null}

      {pending ? <LoadingState /> : null}
      {!pending && failed ? (
        <ErrorState
          onRetry={() => {
            void doctors.refetch();
            void appointments.refetch();
            void slots.refetch();
          }}
        />
      ) : null}
      {!pending && !failed && timeline.length === 0 ? (
        <Card>
          <Text variant="bodyMedium" style={styles.muted}>
            {t('calendar.noHours')}
          </Text>
        </Card>
      ) : null}
      {!pending && !failed
        ? timeline.map((entry) =>
            entry.kind === 'appointment' ? (
              <AppointmentCard
                key={entry.key}
                appointment={entry.appointment}
                onPress={() =>
                  router.push({
                    pathname: '/reception/appointment',
                    params: { id: entry.appointment.id },
                  })
                }
              />
            ) : (
              <Card
                key={entry.key}
                variant="soft"
                title={formatTimeRange(entry.starts_at, entry.ends_at)}
                subtitle={t('calendar.free')}
                accessibilityLabel={t('calendar.bookSlot', {
                  time: formatTimeRange(entry.starts_at, entry.ends_at),
                })}
                onPress={() =>
                  router.push({
                    pathname: '/reception/book',
                    params: { doctor: doctorId ?? '', starts: entry.starts_at },
                  })
                }
              />
            ),
          )
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  days: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  day: { borderColor: palette.outline, backgroundColor: palette.white },
  selected: { backgroundColor: palette.roseSoft, borderColor: palette.rose },
  today: { borderWidth: 2 },
  muted: { color: palette.inkMuted },
});
