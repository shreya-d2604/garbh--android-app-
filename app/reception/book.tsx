import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  EmptyState,
  InfoBanner,
  Screen,
  SectionHeader,
  StatusChip,
  palette,
  spacing,
} from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import type { PatientSummary } from '@/features/reception/api';
import { DoctorChips } from '@/features/reception/components/DoctorChips';
import { PatientPicker } from '@/features/reception/components/PatientPicker';
import { QueryState } from '@/features/reception/components/QueryState';
import { SlotPicker } from '@/features/reception/components/SlotPicker';
import { formatDayTime } from '@/features/reception/format';
import { useBookAppointment, useDoctors, usePatientContext } from '@/features/reception/hooks';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Book an appointment (PLAN.md §7.5 #3, #4). Params: patient, visit, doctor, starts (all optional;
 * the calendar, visits-due and doctor-unavailable screens pre-fill what they know).
 * Only doctors on the patient's care team can be picked; a patient without a doctor yet gets the
 * doctors accepting new patients (the booked doctor becomes her primary, enforced by book_appointment).
 */
export default function BookScreen() {
  const { t } = useTranslation('reception');
  const router = useRouter();
  const params = useLocalSearchParams<{
    patient?: string;
    visit?: string;
    doctor?: string;
    starts?: string;
  }>();
  const [patientId, setPatientId] = useState(first(params.patient));
  const [pickedDoctor, setDoctorId] = useState(first(params.doctor));
  const [visitId, setVisitId] = useState<string | undefined>(first(params.visit));
  // A chosen time belongs to the doctor it was picked for; it is ignored if the doctor changes.
  const [slot, setSlot] = useState<{ doctor: string; startsAt: string } | null>(
    first(params.doctor) && first(params.starts)
      ? { doctor: first(params.doctor) as string, startsAt: first(params.starts) as string }
      : null,
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bookedAt, setBookedAt] = useState<string | null>(null);

  const context = usePatientContext(patientId);
  const doctors = useDoctors();
  const book = useBookAppointment();

  const team = useMemo(() => context.data?.careTeam ?? [], [context.data]);
  const selectable = useMemo(() => {
    const all = doctors.data ?? [];
    return team.length > 0
      ? all.filter((d) => team.some((c) => c.doctor_id === d.id))
      : all.filter((d) => d.accepts_new_patients);
  }, [doctors.data, team]);

  // The doctor from the calendar if she may book them, otherwise her primary (or the first allowed) doctor.
  const primaryId = team.find((c) => c.care_role === 'primary')?.doctor_id;
  const doctorId =
    selectable.find((d) => d.id === pickedDoctor)?.id ??
    selectable.find((d) => d.id === primaryId)?.id ??
    selectable[0]?.id;
  const startsAt = slot && slot.doctor === doctorId ? slot.startsAt : null;

  const pregnancy = context.data?.pregnancy;
  const bookableVisits = (context.data?.visits ?? []).filter(
    (v) => v.status === 'planned' || v.status === 'missed',
  );

  async function submit() {
    if (!pregnancy || !doctorId || !startsAt) return;
    setError(null);
    try {
      await book.mutateAsync({
        doctor: doctorId,
        startsAt,
        pregnancy: pregnancy.id,
        visit: visitId,
        reason,
      });
      setBookedAt(startsAt);
    } catch (e) {
      setError(rpcErrorKey(e as { message?: string; code?: string }));
      // the slot list may have changed under us (someone else booked it)
    }
  }

  if (bookedAt) {
    return (
      <Screen edges={[]} title={t('book.doneTitle')}>
        <Card
          variant="soft"
          title={context.data?.patient.full_name}
          subtitle={formatDayTime(bookedAt)}
        >
          <Text variant="bodyMedium">{t('book.doneMessage')}</Text>
        </Card>
        <Button
          label={t('book.backToCalendar')}
          onPress={() => router.replace('/reception/calendar')}
        />
        <Button
          label={t('book.another')}
          variant="secondary"
          onPress={() => router.replace('/reception/book')}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={[]} title={t('book.title')}>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}

      {!patientId ? (
        <PatientPicker onSelect={(p: PatientSummary) => setPatientId(p.id)} />
      ) : (
        <QueryState
          isPending={context.isPending || doctors.isPending}
          isError={context.isError || doctors.isError}
          onRetry={() => {
            void context.refetch();
            void doctors.refetch();
          }}
          isEmpty={!context.data}
          emptyIcon="account-off-outline"
          emptyTitle={t('book.patientNotFound')}
        >
          <Card
            title={context.data?.patient.full_name}
            subtitle={[context.data?.patient.mrn, context.data?.patient.phone]
              .filter(Boolean)
              .join(' · ')}
            right={
              context.data?.patient.verified_at ? undefined : (
                <StatusChip label={t('tags.unverified')} tone="warning" />
              )
            }
          >
            <Button
              label={t('book.changePatient')}
              variant="text"
              onPress={() => {
                setPatientId(undefined);
                setSlot(null);
              }}
            />
          </Card>

          {!pregnancy ? (
            <EmptyState
              icon="alert-circle-outline"
              title={t('book.noPregnancy')}
              message={t('book.noPregnancyHint')}
            />
          ) : (
            <>
              <SectionHeader title={t('book.doctor')} />
              {team.length === 0 ? <InfoBanner message={t('book.firstVisit')} /> : null}
              {selectable.length === 0 ? (
                <InfoBanner tone="warning" message={t('book.noDoctors')} />
              ) : (
                <DoctorChips
                  doctors={selectable}
                  selected={doctorId}
                  onSelect={setDoctorId}
                  suffix={(id) =>
                    team.find((c) => c.doctor_id === id)?.care_role === 'primary'
                      ? t('book.primary')
                      : undefined
                  }
                />
              )}

              {bookableVisits.length > 0 ? (
                <>
                  <SectionHeader title={t('book.visit')} />
                  <View style={styles.wrap}>
                    <Chip
                      mode="outlined"
                      selected={!visitId}
                      onPress={() => setVisitId(undefined)}
                      style={styles.chip}
                    >
                      {t('book.noVisit')}
                    </Chip>
                    {bookableVisits.map((v) => (
                      <Chip
                        key={v.id}
                        mode="outlined"
                        selected={visitId === v.id}
                        onPress={() => setVisitId(v.id)}
                        style={[styles.chip, visitId === v.id && styles.selected]}
                      >
                        {`${v.seq}. ${v.title}`}
                      </Chip>
                    ))}
                  </View>
                </>
              ) : null}

              <SectionHeader title={t('book.time')} />
              <SlotPicker
                doctorId={doctorId}
                selected={startsAt}
                onSelect={(at) => doctorId && setSlot({ doctor: doctorId, startsAt: at })}
              />

              <TextInput
                mode="outlined"
                label={t('book.reason')}
                value={reason}
                onChangeText={setReason}
                maxLength={200}
                style={styles.input}
                accessibilityLabel={t('book.reason')}
              />
              {startsAt ? (
                <InfoBanner
                  tone="success"
                  icon="calendar-check-outline"
                  message={t('book.summary', { time: formatDayTime(startsAt) })}
                />
              ) : null}
              <Button
                label={t('book.confirm')}
                disabled={!doctorId || !startsAt}
                loading={book.isPending}
                onPress={() => void submit()}
              />
            </>
          )}
        </QueryState>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    borderColor: palette.outline,
    backgroundColor: palette.white,
  },
  selected: { backgroundColor: palette.roseSoft, borderColor: palette.rose },
  input: { backgroundColor: palette.white },
});
