import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { HelperText, TextInput } from 'react-native-paper';

import { Button, Card, ErrorState, FormField, InfoBanner, LoadingState } from '@/components';

import { PregnancyLinks } from '../components/PregnancyLinks';
import { VITAL_LIMITS, implausibleVitals, type VitalKey } from '../data-quality';
import { adminErrorKey } from '../errors';
import { useConsultation, useLabResult, useUpdateConsultation, useUpdateLabValue } from '../hooks';
import { vitalsSchema, type VitalsForm } from '../schemas';
import type { Database } from '@/types/database';

type ConsultationRow = Database['public']['Tables']['consultations']['Row'];

const KEYS = Object.keys(VITAL_LIMITS) as VitalKey[];
const toStr = (v: number | null) => (v === null ? '' : String(v));

/** Likely typo in a consultation's vitals (or a negative lab value): correct it here. */
export function ImplausibleFix({ id }: { id: string }) {
  const consultation = useConsultation(id);
  // The issue points at a consultation, or (for negative lab values) at a lab result.
  const notAConsultation = consultation.data === null;
  const lab = useLabResult(id, notAConsultation);

  if (consultation.isLoading || (notAConsultation && lab.isLoading)) return <LoadingState />;
  if (consultation.isError || lab.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void consultation.refetch();
          void lab.refetch();
        }}
      />
    );
  }
  if (consultation.data) return <VitalsFixForm consultation={consultation.data} />;
  if (lab.data)
    return (
      <LabValueForm
        id={lab.data.id}
        value={lab.data.value_num}
        pregnancyId={lab.data.pregnancy_id}
      />
    );
  return <Gone />;
}

function Gone() {
  const { t } = useTranslation('admin');
  return <InfoBanner tone="success" icon="check-circle-outline" message={t('dq.fix.goneHint')} />;
}

function VitalsFixForm({ consultation }: { consultation: ConsultationRow }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const update = useUpdateConsultation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<VitalsForm, unknown, VitalsForm>({
    resolver: zodResolver(vitalsSchema),
    defaultValues: {
      bp_systolic: toStr(consultation.bp_systolic),
      bp_diastolic: toStr(consultation.bp_diastolic),
      pulse: toStr(consultation.pulse),
      temperature: toStr(consultation.temperature),
      spo2: toStr(consultation.spo2),
      weight_kg: toStr(consultation.weight_kg),
      fetal_heart_rate: toStr(consultation.fetal_heart_rate),
      fundal_height_cm: toStr(consultation.fundal_height_cm),
    },
  });
  const values = useWatch({ control });
  const flagged = implausibleVitals(values as Partial<Record<VitalKey, string>>);

  const onSubmit = handleSubmit((v) => {
    setError(null);
    const num = (s: string | undefined) => (s && s.trim() !== '' ? Number(s) : null);
    update.mutate(
      {
        id: consultation.id,
        values: {
          bp_systolic: num(v.bp_systolic),
          bp_diastolic: num(v.bp_diastolic),
          pulse: num(v.pulse),
          temperature: num(v.temperature),
          spo2: num(v.spo2),
          weight_kg: num(v.weight_kg),
          fetal_heart_rate: num(v.fetal_heart_rate),
          fundal_height_cm: num(v.fundal_height_cm),
        },
      },
      { onSuccess: () => router.back(), onError: (e) => setError(adminErrorKey(e)) },
    );
  });

  return (
    <>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <Card title={t('dq.fix.vitals')}>
        <InfoBanner message={t('dq.fix.vitalsHint')} />
        {flagged.length > 0 ? (
          <InfoBanner
            tone="warning"
            message={t('dq.fix.unusual', {
              fields: flagged.map((k) => t(`dq.fix.vital.${k}`)).join(', '),
            })}
          />
        ) : null}
        {KEYS.map((k) => (
          <FormField
            key={k}
            control={control}
            name={k}
            label={t(`dq.fix.vital.${k}`)}
            keyboardType="numeric"
            hint={t('dq.fix.expected', { min: VITAL_LIMITS[k][0], max: VITAL_LIMITS[k][1] })}
          />
        ))}
        <Button
          label={t('actions.save', { ns: 'common' })}
          onPress={() => void onSubmit()}
          loading={formState.isSubmitting || update.isPending}
        />
      </Card>
      <PregnancyLinks pregnancyId={consultation.pregnancy_id} />
    </>
  );
}

function LabValueForm({
  id,
  value,
  pregnancyId,
}: {
  id: string;
  value: number | null;
  pregnancyId: string;
}) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const update = useUpdateLabValue();
  const [text, setText] = useState(value === null ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  const valid = text.trim() === '' || /^-?\d+(\.\d+)?$/.test(text.trim());

  return (
    <>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <Card title={t('dq.fix.labValue')}>
        <InfoBanner message={t('dq.fix.labValueHint')} />
        <LabValueInput value={text} onChange={setText} valid={valid} />
        <Button
          label={t('actions.save', { ns: 'common' })}
          disabled={!valid}
          loading={update.isPending}
          onPress={() =>
            update.mutate(
              { id, value: text.trim() === '' ? null : Number(text) },
              { onSuccess: () => router.back(), onError: (e) => setError(adminErrorKey(e)) },
            )
          }
        />
      </Card>
      <PregnancyLinks pregnancyId={pregnancyId} />
    </>
  );
}

function LabValueInput({
  value,
  onChange,
  valid,
}: {
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
}) {
  const { t } = useTranslation('admin');
  return (
    <>
      <TextInput
        mode="outlined"
        label={t('dq.fix.labValue')}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        error={!valid}
        accessibilityLabel={t('dq.fix.labValue')}
      />
      <HelperText type="error" visible={!valid}>
        {t('validation.number')}
      </HelperText>
    </>
  );
}
