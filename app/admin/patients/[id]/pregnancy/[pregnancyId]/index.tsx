import { zodResolver } from '@hookform/resolvers/zod';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  DateField,
  FormField,
  InfoBanner,
  ListItem,
  QueryBoundary,
  Screen,
} from '@/components';
import { addDays, todayISO } from '@/domain/pregnancy-math';
import { logPatientView, type PregnancyRow } from '@/features/admin/api';
import { ChoiceChips } from '@/features/admin/components/ChoiceChips';
import { KeyValue } from '@/features/admin/components/KeyValue';
import { firstParam } from '@/features/admin/components/ui';
import { adminErrorKey } from '@/features/admin/errors';
import { gaLabel, joinList } from '@/features/admin/format';
import {
  usePregnancy,
  useUpdatePregnancyDates,
  useUpdatePregnancyStatus,
} from '@/features/admin/hooks';
import {
  PREGNANCY_STATUSES,
  RISK_LEVELS,
  pregnancyDatesSchema,
  pregnancyStatusSchema,
  toPregnancyStatusUpdate,
  type PregnancyDatesForm,
  type PregnancyStatusForm,
} from '@/features/admin/schemas';

/** One pregnancy: fix LMP / EDD, risk and status, and the way into the care team. */
export default function PregnancyDetail() {
  const { t } = useTranslation('admin');
  const params = useLocalSearchParams<{ id: string; pregnancyId: string }>();
  const patientId = firstParam(params.id);
  const pregnancyId = firstParam(params.pregnancyId);
  const query = usePregnancy(pregnancyId);

  useEffect(() => {
    if (patientId && pregnancyId) void logPatientView(patientId, 'pregnancies', pregnancyId);
  }, [patientId, pregnancyId]);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('pregnancy.title') }} />
      <QueryBoundary
        query={query}
        isEmpty={(p) => p === null}
        empty={{ title: t('pregnancy.notFound'), icon: 'help-circle-outline' }}
      >
        {(p) => (p ? <Body pregnancy={p} patientId={patientId} /> : null)}
      </QueryBoundary>
    </Screen>
  );
}

function Body({ pregnancy, patientId }: { pregnancy: PregnancyRow; patientId: string }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const today = todayISO();
  const ga = pregnancy.status === 'active' ? gaLabel(pregnancy.edd_final, today) : null;
  return (
    <>
      <Card
        title={t(`pregnancy.status.${pregnancy.status}`)}
        subtitle={ga ? t('patients.ga', { ga }) : undefined}
      >
        <KeyValue label={t('pregnancy.lmp')} value={pregnancy.lmp_date} />
        <KeyValue label={t('pregnancy.eddUsg')} value={pregnancy.edd_usg} />
        <KeyValue label={t('pregnancy.eddFinal')} value={pregnancy.edd_final} />
        <KeyValue
          label={t('pregnancy.source')}
          value={t(`pregnancy.sources.${pregnancy.lmp_source}`)}
        />
        <KeyValue
          label={t('pregnancy.gpal')}
          value={
            [pregnancy.gravida, pregnancy.para, pregnancy.abortus, pregnancy.living].some(
              (v) => v !== null,
            )
              ? `G${pregnancy.gravida ?? '-'} P${pregnancy.para ?? '-'} A${pregnancy.abortus ?? '-'} L${pregnancy.living ?? '-'}`
              : null
          }
        />
        <KeyValue
          label={t('pregnancy.risk.label')}
          value={t(`pregnancy.risk.${pregnancy.risk_level}`)}
        />
      </Card>

      <Card>
        <ListItem
          icon="account-group-outline"
          title={t('careTeam.title')}
          description={t('careTeam.open')}
          onPress={() =>
            router.push(`/admin/patients/${patientId}/pregnancy/${pregnancy.id}/care-team` as never)
          }
        />
      </Card>

      <DatesForm pregnancy={pregnancy} />
      <StatusForm pregnancy={pregnancy} />
    </>
  );
}

function DatesForm({ pregnancy }: { pregnancy: PregnancyRow }) {
  const { t } = useTranslation('admin');
  const today = todayISO();
  const active = pregnancy.status === 'active';
  const schema = useMemo(() => pregnancyDatesSchema(today, active), [today, active]);
  const update = useUpdatePregnancyDates();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, reset, setValue, formState } = useForm<
    PregnancyDatesForm,
    unknown,
    PregnancyDatesForm
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      lmp_date: pregnancy.lmp_date ?? '',
      edd_usg: pregnancy.edd_usg ?? '',
      reason: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setNotice(null);
    setError(null);
    try {
      await update.mutateAsync({
        id: pregnancy.id,
        lmp: values.lmp_date || null,
        eddUsg: values.edd_usg || null,
        reason: values.reason.trim(),
      });
      setNotice(t('pregnancy.datesSaved'));
      reset({ lmp_date: values.lmp_date, edd_usg: values.edd_usg, reason: '' });
    } catch (e) {
      setError(adminErrorKey(e as Error));
    }
  });

  return (
    <Card title={t('pregnancy.fixDates')} subtitle={t('pregnancy.fixDatesHint')}>
      {notice ? <InfoBanner tone="success" icon="check-circle-outline" message={notice} /> : null}
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <DateField
        control={control}
        name="lmp_date"
        label={t('pregnancy.lmp')}
        minimumDate={active ? addDays(today, -300) : undefined}
        maximumDate={today}
      />
      <DateField
        control={control}
        name="edd_usg"
        label={t('pregnancy.eddUsg')}
        hint={t('pregnancy.eddUsgHint')}
      />
      <Button
        label={t('pregnancy.clearEddUsg')}
        variant="text"
        onPress={() => setValue('edd_usg', '', { shouldDirty: true })}
      />
      <FormField
        control={control}
        name="reason"
        label={t('pregnancy.reason')}
        hint={t('pregnancy.reasonHint')}
      />
      <Button
        label={t('pregnancy.saveDates')}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
      />
    </Card>
  );
}

function StatusForm({ pregnancy }: { pregnancy: PregnancyRow }) {
  const { t } = useTranslation('admin');
  const update = useUpdatePregnancyStatus();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<
    PregnancyStatusForm,
    unknown,
    PregnancyStatusForm
  >({
    resolver: zodResolver(pregnancyStatusSchema),
    defaultValues: {
      risk_level: pregnancy.risk_level,
      risk_factors: joinList(pregnancy.risk_factors),
      status: pregnancy.status,
      outcome_date: pregnancy.outcome_date ?? '',
      outcome_notes: pregnancy.outcome_notes ?? '',
    },
  });
  const status = useWatch({ control, name: 'status' });

  const onSubmit = handleSubmit(async (values) => {
    setNotice(null);
    setError(null);
    try {
      await update.mutateAsync({ id: pregnancy.id, values: toPregnancyStatusUpdate(values) });
      setNotice(t('pregnancy.statusSaved'));
    } catch (e) {
      setError(adminErrorKey(e as Error));
    }
  });

  return (
    <Card title={t('pregnancy.riskAndStatus')}>
      {notice ? <InfoBanner tone="success" icon="check-circle-outline" message={notice} /> : null}
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <Controller
        control={control}
        name="risk_level"
        render={({ field }) => (
          <ChoiceChips
            value={field.value}
            onChange={field.onChange}
            accessibilityLabel={t('pregnancy.risk.label')}
            options={RISK_LEVELS.map((r) => ({ value: r, label: t(`pregnancy.risk.${r}`) }))}
          />
        )}
      />
      <FormField
        control={control}
        name="risk_factors"
        label={t('pregnancy.riskFactors')}
        hint={t('patient.listHint')}
      />
      <Controller
        control={control}
        name="status"
        render={({ field }) => (
          <ChoiceChips
            value={field.value}
            onChange={field.onChange}
            accessibilityLabel={t('pregnancy.statusLabel')}
            options={PREGNANCY_STATUSES.map((s) => ({
              value: s,
              label: t(`pregnancy.status.${s}`),
            }))}
          />
        )}
      />
      {status !== 'active' ? (
        <>
          <DateField
            control={control}
            name="outcome_date"
            label={t('pregnancy.outcomeDate')}
            maximumDate={todayISO()}
          />
          <FormField
            control={control}
            name="outcome_notes"
            label={t('pregnancy.outcomeNotes')}
            multiline
          />
        </>
      ) : null}
      <Button
        label={t('actions.save', { ns: 'common' })}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
      />
    </Card>
  );
}
