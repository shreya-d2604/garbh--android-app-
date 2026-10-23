import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Dialog, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  ChoiceChips,
  EmptyState,
  ErrorState,
  FormField,
  InfoBanner,
  LoadingState,
  palette,
  Screen,
  spacing,
  StatusChip,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import type { ConsultationBundle } from '@/features/doctor/api';
import { PrescriptionEditor } from '@/features/doctor/components/consult/PrescriptionEditor';
import { ErrorBanner } from '@/features/doctor/components/ErrorBanner';
import { SwitchRow } from '@/features/doctor/components/SwitchRow';
import {
  consultationSchema,
  publishIssues,
  valuesFromConsultation,
  vitalWarnings,
  type ConsultationFormValues,
} from '@/features/doctor/consultation';
import { formatGa, gaFromEdd } from '@/features/doctor/format';
import {
  useConsultationBundle,
  useDrugCatalog,
  useMyId,
  usePublishConsultation,
  useSaveConsultation,
  useStartConsultation,
} from '@/features/doctor/hooks';
import { newId } from '@/features/doctor/ids';
import type { PublishOutcome } from '@/features/doctor/publish-flow';
import { canStart } from '@/features/doctor/queue';
import { useSecureScreen } from '@/features/doctor/use-secure-screen';

const AUTOSAVE_MS = 1500;

const PRESENTATION = ['Cephalic', 'Breech', 'Transverse', 'Variable'] as const;
const MOVEMENTS = ['Normal', 'Reduced', 'Absent'] as const;
const EDEMA = ['None', 'Mild', 'Moderate', 'Severe'] as const;
const URINE = ['Nil', 'Trace', '+', '++', '+++'] as const;

export default function ConsultScreen() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  const { t } = useTranslation('doctor');
  const bundle = useConsultationBundle(appointmentId);

  if (bundle.isPending)
    return (
      <Screen edges={['bottom']}>
        <LoadingState />
      </Screen>
    );
  if (bundle.isError)
    return (
      <Screen edges={['bottom']}>
        <ErrorState onRetry={() => void bundle.refetch()} />
      </Screen>
    );
  if (!bundle.data) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="calendar-remove-outline"
          title={t('consult.notFoundTitle')}
          message={t('consult.notFoundMessage')}
        />
      </Screen>
    );
  }
  return <ConsultForm appointmentId={appointmentId} bundle={bundle.data} />;
}

/** One sectioned form with autosave. Publishing makes advice + prescription visible to the patient. */
function ConsultForm({
  appointmentId,
  bundle,
}: {
  appointmentId: string;
  bundle: ConsultationBundle;
}) {
  const { t } = useTranslation('doctor');
  const router = useRouter();
  useSecureScreen('doctor-consult');
  const me = useMyId();
  const { appointment, consultation } = bundle;
  const pregnancyId = appointment.pregnancy_id;

  const catalog = useDrugCatalog();
  const save = useSaveConsultation(pregnancyId);
  const publish = usePublishConsultation(pregnancyId);
  const start = useStartConsultation();

  const initial = useMemo(
    () => valuesFromConsultation(consultation, bundle.privateNote, bundle.items),
    [consultation, bundle.privateNote, bundle.items],
  );
  const { control, getValues, setValue, trigger } = useForm<
    ConsultationFormValues,
    unknown,
    ConsultationFormValues
  >({
    resolver: zodResolver(consultationSchema),
    mode: 'onChange',
    defaultValues: initial,
  });
  const values = useWatch({ control }) as ConsultationFormValues;

  const [status, setStatus] = useState(appointment.status);
  const [published, setPublished] = useState(consultation?.published_at != null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirming, setConfirming] = useState(false);
  const [withAi, setWithAi] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<PublishOutcome | null>(null);

  const idRef = useRef<string | null>(consultation?.id ?? null);
  const lastSaved = useRef(initial);
  const inflight = useRef<Promise<string | null> | null>(null);
  const [tick, setTick] = useState(0);
  const [consultationId, setConsultationId] = useState<string | null>(consultation?.id ?? null);

  const ga = gaFromEdd(appointment.pregnancies?.edd_final, todayISO());

  /** Saves the form now; a save already running is awaited instead of starting a second one. */
  const persist = useCallback((): Promise<string | null> => {
    if (inflight.current) return inflight.current;
    if (!me) return Promise.resolve(idRef.current);
    setSaveState('saving');
    const snapshot = getValues();
    const run = save
      .mutateAsync({
        consultationId: idRef.current,
        appointmentId,
        pregnancyId,
        doctorId: me,
        ga: ga ? { weeks: ga.weeks, days: ga.days } : null,
        values: snapshot,
        previous: lastSaved.current,
        newId,
      })
      .then((id) => {
        idRef.current = id;
        setConsultationId(id);
        lastSaved.current = snapshot;
        setSaveState('saved');
        return id;
      })
      .catch(() => {
        setSaveState('error');
        return null;
      })
      .finally(() => {
        inflight.current = null;
        // Anything typed while this save ran is picked up by the autosave effect.
        setTick((n) => n + 1);
      });
    inflight.current = run;
    return run;
    // `save.mutateAsync` is stable; `ga` only changes with the day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, pregnancyId, me, ga?.weeks, ga?.days, getValues]);

  // Autosave the draft 1.5 s after the last change (only once something differs from what was saved).
  useEffect(() => {
    if (publish.isPending || outcome || confirming) return;
    const json = JSON.stringify(values);
    if (json === JSON.stringify(lastSaved.current)) return;
    const timer = setTimeout(() => void persist(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [values, persist, publish.isPending, outcome, confirming, tick]);

  const onStart = () =>
    start.mutate(appointmentId, { onSuccess: () => setStatus('in_consultation') });

  const onPublishPressed = async () => {
    const valid = await trigger();
    const problems = publishIssues(getValues());
    if (!valid && !problems.includes('publish.fixErrors')) problems.push('publish.fixErrors');
    setIssues(problems);
    if (problems.length === 0) setConfirming(true);
  };

  const onConfirmPublish = async () => {
    if (!me) return;
    await inflight.current;
    publish.mutate(
      {
        save: {
          consultationId: idRef.current,
          appointmentId,
          pregnancyId,
          doctorId: me,
          ga: ga ? { weeks: ga.weeks, days: ga.days } : null,
          values: getValues(),
          previous: lastSaved.current,
          newId,
        },
        appointmentStatus: status,
        alreadyPublished: published,
        withAiSummary: withAi,
      },
      {
        onSuccess: (res) => {
          idRef.current = res.consultationId;
          setConsultationId(res.consultationId);
          lastSaved.current = getValues();
          setPublished(true);
          setStatus('completed');
          setOutcome(res);
          setConfirming(false);
        },
        onError: () => setConfirming(false),
      },
    );
  };

  const warnings = vitalWarnings(values);
  const allergies = appointment.patients?.allergies ?? [];

  if (outcome) {
    return (
      <Screen edges={['bottom']}>
        <Card variant="soft" title={t('publish.doneTitle')} subtitle={t('publish.doneMessage')}>
          {outcome.aiError ? (
            <InfoBanner tone="warning" message={t('publish.aiNotStarted')} />
          ) : null}
          {withAi && !outcome.aiError ? (
            <InfoBanner tone="success" message={t('publish.aiStarted')} />
          ) : null}
          {outcome.statusNotUpdated ? (
            <InfoBanner tone="warning" message={t('publish.statusNotUpdated')} />
          ) : null}
          <Button
            label={t('publish.backToToday')}
            onPress={() => router.replace('/doctor/today')}
          />
          <Button
            label={t('publish.openChart')}
            variant="secondary"
            onPress={() => router.replace(`/doctor/patient/${pregnancyId}`)}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      edges={['bottom']}
      title={appointment.patients?.full_name ?? ''}
      subtitle={[
        format(new Date(appointment.starts_at), 'h:mm a'),
        appointment.reason,
        ga ? formatGa(ga) : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      footer={
        <View style={styles.footer}>
          <Text variant="bodySmall" style={styles.saveState} accessibilityLiveRegion="polite">
            {t(`consult.save.${saveState}`)}
          </Text>
          <Button
            label={published ? t('consult.saveChanges') : t('consult.publish')}
            loading={publish.isPending}
            onPress={() => void (published ? persist() : onPublishPressed())}
          />
        </View>
      }
    >
      {published ? <StatusChip label={t('timeline.published')} tone="success" /> : null}
      {published ? <InfoBanner tone="info" message={t('consult.publishedNote')} /> : null}
      {allergies.length > 0 ? (
        <View style={styles.chips}>
          {allergies.map((a) => (
            <StatusChip key={a} label={t('consult.allergyChip', { name: a })} tone="danger" />
          ))}
        </View>
      ) : null}
      {canStart(status) ? (
        <Card variant="soft" title={t('consult.notStartedTitle')}>
          <Button label={t('today.start')} loading={start.isPending} onPress={onStart} />
          <ErrorBanner error={start.error} />
        </Card>
      ) : null}

      <Card title={t('consult.vitals')}>
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField
              control={control}
              name="weight_kg"
              label={t('consult.weight')}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.half}>
            <FormField
              control={control}
              name="pulse"
              label={t('consult.pulse')}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField
              control={control}
              name="bp_systolic"
              label={t('consult.bpSystolic')}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.half}>
            <FormField
              control={control}
              name="bp_diastolic"
              label={t('consult.bpDiastolic')}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField
              control={control}
              name="temperature"
              label={t('consult.temperature')}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.half}>
            <FormField
              control={control}
              name="spo2"
              label={t('consult.spo2')}
              keyboardType="number-pad"
            />
          </View>
        </View>
        {warnings.length > 0 ? (
          <View style={styles.chips}>
            {warnings.map((w) => (
              <StatusChip key={w} label={t(`consult.warning.${w}`)} tone="warning" />
            ))}
          </View>
        ) : null}
      </Card>

      <Card title={t('consult.exam')}>
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField
              control={control}
              name="fundal_height_cm"
              label={t('consult.fundal')}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.half}>
            <FormField
              control={control}
              name="fetal_heart_rate"
              label={t('consult.fhr')}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <Chips
          control={control}
          name="presentation"
          label={t('consult.presentation')}
          options={PRESENTATION}
        />
        <Chips
          control={control}
          name="fetal_movements"
          label={t('consult.movements')}
          options={MOVEMENTS}
        />
        <Chips control={control} name="edema" label={t('consult.edema')} options={EDEMA} />
        <Chips
          control={control}
          name="urine_albumin"
          label={t('consult.urineAlbumin')}
          options={URINE}
        />
        <Chips
          control={control}
          name="urine_sugar"
          label={t('consult.urineSugar')}
          options={URINE}
        />
      </Card>

      <Card title={t('consult.findings')}>
        <FormField control={control} name="complaints" label={t('consult.complaints')} multiline />
        <FormField control={control} name="findings" label={t('consult.findingsLabel')} multiline />
      </Card>

      <Card variant="soft" title={t('consult.advice')} subtitle={t('consult.adviceHint')}>
        <FormField control={control} name="advice" label={t('consult.adviceLabel')} multiline />
        <FormField control={control} name="diet_advice" label={t('consult.diet')} multiline />
      </Card>

      <PrescriptionEditor
        control={control}
        setValue={setValue}
        catalog={catalog.data ?? []}
        pregnancyId={pregnancyId}
        consultationId={consultationId}
      />

      <Card title={t('consult.private')} subtitle={t('consult.privateHint')}>
        <FormField
          control={control}
          name="private_note"
          label={t('consult.privateLabel')}
          multiline
        />
      </Card>

      <Card title={t('consult.nextVisit')}>
        <FormField
          control={control}
          name="next_visit_after_weeks"
          label={t('consult.nextVisitWeeks')}
          keyboardType="number-pad"
          hint={t('consult.nextVisitHint')}
        />
      </Card>

      {issues.map((k) => (
        <InfoBanner key={k} tone="danger" message={t(k)} />
      ))}
      <ErrorBanner error={publish.error} />

      <Portal>
        <Dialog visible={confirming} onDismiss={() => setConfirming(false)}>
          <Dialog.Title>{t('publish.confirmTitle')}</Dialog.Title>
          <Dialog.Content style={styles.dialog}>
            <Text variant="bodyMedium">{t('publish.confirmMessage')}</Text>
            <SwitchRow
              label={t('publish.withAi')}
              hint={t('publish.withAiHint')}
              value={withAi}
              onChange={setWithAi}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              label={t('common:actions.cancel')}
              variant="text"
              onPress={() => setConfirming(false)}
            />
            <Button
              label={t('consult.publish')}
              fullWidth={false}
              loading={publish.isPending}
              onPress={() => void onConfirmPublish()}
            />
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Screen>
  );
}

function Chips({
  control,
  name,
  label,
  options,
}: {
  control: Control<ConsultationFormValues, unknown, ConsultationFormValues>;
  name: 'presentation' | 'fetal_movements' | 'edema' | 'urine_albumin' | 'urine_sugar';
  label: string;
  options: readonly string[];
}) {
  return (
    <View style={styles.chipGroup}>
      <Text variant="labelMedium" style={styles.label}>
        {label}
      </Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { value, onChange } }) => (
          <ChoiceChips
            scroll
            value={value}
            onChange={onChange}
            options={options.map((o) => ({ value: o, label: o }))}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipGroup: { gap: spacing.xs },
  label: { color: palette.inkMuted },
  footer: { padding: spacing.md, gap: spacing.xs, backgroundColor: palette.cream },
  saveState: { color: palette.inkMuted, textAlign: 'center' },
  dialog: { gap: spacing.sm },
});
