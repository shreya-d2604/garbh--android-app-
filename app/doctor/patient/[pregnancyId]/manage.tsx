import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  ChoiceChips,
  ConfirmDialog,
  DateField,
  EmptyState,
  ErrorState,
  FormField,
  InfoBanner,
  LoadingState,
  palette,
  Screen,
  spacing,
} from '@/components';
import { addDays, todayISO } from '@/domain/pregnancy-math';
import type { ChartData } from '@/features/doctor/api';
import { ErrorBanner } from '@/features/doctor/components/ErrorBanner';
import { SwitchRow } from '@/features/doctor/components/SwitchRow';
import { useChart, useUpdatePregnancy } from '@/features/doctor/hooks';
import {
  BLOOD_GROUPS,
  CLOSING_STATUSES,
  outcomeSchema,
  pregnancyDefaults,
  pregnancyFormSchema,
  previewEdd,
  toMedicalPatch,
  toPregnancyPatch,
  type OutcomeValues,
  type PregnancyFormValues,
} from '@/features/doctor/pregnancy-form';
import { useSecureScreen } from '@/features/doctor/use-secure-screen';

/** Pregnancy management (PLAN.md §7.4 #8): dates, risk, history, medical info, outcome. */
export default function ManagePregnancy() {
  const { pregnancyId } = useLocalSearchParams<{ pregnancyId: string }>();
  const { t } = useTranslation('doctor');
  useSecureScreen('doctor-manage');
  const chart = useChart(pregnancyId);

  if (chart.isPending)
    return (
      <Screen edges={['bottom']}>
        <LoadingState />
      </Screen>
    );
  if (chart.isError)
    return (
      <Screen edges={['bottom']}>
        <ErrorState onRetry={() => void chart.refetch()} />
      </Screen>
    );
  if (!chart.data) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="account-off-outline"
          title={t('chart.notFoundTitle')}
          message={t('chart.notFoundMessage')}
        />
      </Screen>
    );
  }
  return <ManageForm pregnancyId={pregnancyId} chart={chart.data} />;
}

function ManageForm({ pregnancyId, chart }: { pregnancyId: string; chart: ChartData }) {
  const { t } = useTranslation('doctor');
  const router = useRouter();
  const today = todayISO();
  const save = useUpdatePregnancy(pregnancyId);
  const [saved, setSaved] = useState(false);

  const initial = useMemo(() => pregnancyDefaults(chart.pregnancy, chart.patient), [chart]);
  const schema = useMemo(() => pregnancyFormSchema(today), [today]);
  const { control, handleSubmit, setValue } = useForm<
    PregnancyFormValues,
    unknown,
    PregnancyFormValues
  >({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });
  const watched = useWatch({ control });
  const newEdd = previewEdd({ lmp_date: watched.lmp_date ?? '', edd_usg: watched.edd_usg ?? '' });
  const eddChanged = newEdd !== chart.pregnancy.edd_final;
  const active = chart.pregnancy.status === 'active';

  const onSave = handleSubmit((values) => {
    setSaved(false);
    save.mutate(
      {
        pregnancy: toPregnancyPatch(values, initial),
        patientId: chart.patient.id,
        medical: toMedicalPatch(values),
      },
      { onSuccess: () => setSaved(true) },
    );
  });

  return (
    <Screen edges={['bottom']} subtitle={chart.patient.full_name}>
      <Card title={t('manage.dates')}>
        <DateField
          control={control}
          name="lmp_date"
          label={t('manage.lmp')}
          hint={
            chart.pregnancy.lmp_source === 'patient_reported' ? t('manage.lmpReported') : undefined
          }
          minimumDate={addDays(today, -300)}
          maximumDate={today}
        />
        <DateField
          control={control}
          name="edd_usg"
          label={t('manage.eddScan')}
          hint={t('manage.eddScanHint')}
          minimumDate={addDays(today, -60)}
          maximumDate={addDays(today, 300)}
        />
        {watched.edd_usg ? (
          <Button
            label={t('manage.clearScan')}
            variant="text"
            onPress={() => setValue('edd_usg', '', { shouldDirty: true })}
          />
        ) : null}
        <Controller
          control={control}
          name="confirmed"
          render={({ field: { value, onChange } }) => (
            <SwitchRow
              label={t('manage.confirmed')}
              hint={t('manage.confirmedHint')}
              value={value}
              onChange={onChange}
            />
          )}
        />
        {newEdd ? (
          <Text variant="bodyMedium" style={styles.muted}>
            {t('manage.newEdd', { date: newEdd })}
          </Text>
        ) : null}
        {eddChanged && active ? (
          <InfoBanner tone="warning" icon="calendar-sync" message={t('manage.eddWarning')} />
        ) : null}
      </Card>

      <Card title={t('manage.risk')}>
        <Controller
          control={control}
          name="risk_level"
          render={({ field: { value, onChange } }) => (
            <ChoiceChips
              allowClear={false}
              value={value}
              onChange={(v) => v !== '' && onChange(v)}
              options={(['low', 'moderate', 'high'] as const).map((r) => ({
                value: r,
                label: t(`chart.risk.${r}`),
              }))}
            />
          )}
        />
        <FormField
          control={control}
          name="risk_factors"
          label={t('manage.riskFactors')}
          hint={t('manage.listHint')}
        />
      </Card>

      <Card title={t('manage.history')}>
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField
              control={control}
              name="gravida"
              label={t('manage.gravida')}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.half}>
            <FormField
              control={control}
              name="para"
              label={t('manage.para')}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField
              control={control}
              name="abortus"
              label={t('manage.abortus')}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.half}>
            <FormField
              control={control}
              name="living"
              label={t('manage.living')}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <FormField
          control={control}
          name="multiple_gestation"
          label={t('manage.babies')}
          hint={t('manage.babiesHint')}
          keyboardType="number-pad"
        />
      </Card>

      <Card title={t('manage.medical')}>
        <Controller
          control={control}
          name="blood_group"
          render={({ field: { value, onChange } }) => (
            <ChoiceChips
              scroll
              value={value}
              onChange={onChange}
              options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))}
            />
          )}
        />
        <Controller
          control={control}
          name="rh_negative"
          render={({ field: { value, onChange } }) => (
            <SwitchRow label={t('manage.rhNegative')} value={value} onChange={onChange} />
          )}
        />
        <FormField
          control={control}
          name="allergies"
          label={t('manage.allergies')}
          hint={t('manage.listHint')}
        />
        <FormField
          control={control}
          name="chronic_conditions"
          label={t('manage.conditions')}
          hint={t('manage.listHint')}
        />
      </Card>

      <ErrorBanner error={save.error} />
      {saved ? (
        <InfoBanner tone="success" icon="check-circle-outline" message={t('manage.saved')} />
      ) : null}
      <Button
        label={t('common:actions.save')}
        loading={save.isPending}
        onPress={() => void onSave()}
      />

      {active ? (
        <OutcomeCard pregnancyId={pregnancyId} onClosed={() => router.back()} />
      ) : (
        <InfoBanner
          tone="info"
          icon="flag-checkered"
          message={t('manage.closedNote', { status: t(`chart.outcome.${chart.pregnancy.status}`) })}
        />
      )}
    </Screen>
  );
}

function OutcomeCard({ pregnancyId, onClosed }: { pregnancyId: string; onClosed: () => void }) {
  const { t } = useTranslation('doctor');
  const today = todayISO();
  const update = useUpdatePregnancy(pregnancyId);
  const [confirm, setConfirm] = useState<OutcomeValues | null>(null);
  const { control, handleSubmit } = useForm<OutcomeValues, unknown, OutcomeValues>({
    resolver: zodResolver(outcomeSchema(today)),
    defaultValues: { status: 'delivered', outcome_date: today, outcome_notes: '' },
  });

  return (
    <Card title={t('outcome.title')} subtitle={t('outcome.subtitle')}>
      <Controller
        control={control}
        name="status"
        render={({ field: { value, onChange } }) => (
          <ChoiceChips
            allowClear={false}
            value={value}
            onChange={(v) => v !== '' && onChange(v)}
            options={CLOSING_STATUSES.map((s) => ({ value: s, label: t(`chart.outcome.${s}`) }))}
          />
        )}
      />
      <DateField
        control={control}
        name="outcome_date"
        label={t('outcome.date')}
        maximumDate={today}
      />
      <FormField control={control} name="outcome_notes" label={t('outcome.notes')} multiline />
      <ErrorBanner error={update.error} />
      <Button
        label={t('outcome.close')}
        variant="danger"
        onPress={() => void handleSubmit((v) => setConfirm(v))()}
      />
      <ConfirmDialog
        visible={confirm !== null}
        title={t('outcome.confirmTitle')}
        message={t('outcome.confirmMessage')}
        confirmLabel={t('outcome.close')}
        danger
        loading={update.isPending}
        onDismiss={() => setConfirm(null)}
        onConfirm={() =>
          confirm &&
          update.mutate(
            {
              pregnancy: {
                status: confirm.status,
                outcome_date: confirm.outcome_date,
                outcome_notes: confirm.outcome_notes.trim() || null,
              },
            },
            { onSuccess: onClosed, onSettled: () => setConfirm(null) },
          )
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  muted: { color: palette.inkMuted },
});
