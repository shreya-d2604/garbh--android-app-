import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  DateField,
  FormField,
  InfoBanner,
  Screen,
  SectionHeader,
  palette,
} from '@/components';
import { addDays, todayISO } from '@/domain/pregnancy-math';
import { rpcErrorKey } from '@/domain/rpc-errors';
import type { PatientSummary } from '@/features/reception/api';
import { PatientPicker } from '@/features/reception/components/PatientPicker';
import { QueryState } from '@/features/reception/components/QueryState';
import {
  useQueuePatient,
  useSuggestedMrn,
  useUpdatePatientDetails,
  useVerifyPatient,
} from '@/features/reception/hooks';
import {
  patientDetailsEditSchema,
  type PatientDetailsEditForm,
} from '@/features/reception/schemas';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Verify one self-registered patient: check the photo ID, correct her details, assign the hospital number
 * (MRN), or merge her into an existing desk record. Verifying notifies her and unlocks companion invites.
 */
export default function VerifyPatientScreen() {
  const { t } = useTranslation('reception');
  const router = useRouter();
  const id = first(useLocalSearchParams<{ id?: string }>().id);
  const patient = useQueuePatient(id);
  const suggestion = useSuggestedMrn(!!id);
  const update = useUpdatePatientDetails();
  const verify = useVerifyPatient();
  const today = todayISO();

  const [typedMrn, setTypedMrn] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<PatientSummary | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { control, handleSubmit } = useForm<
    PatientDetailsEditForm,
    unknown,
    PatientDetailsEditForm
  >({
    resolver: zodResolver(patientDetailsEditSchema),
    values: patient.data
      ? {
          full_name: patient.data.full_name,
          phone: patient.data.phone ?? '',
          email: patient.data.email ?? '',
          dob: patient.data.dob ?? '',
          address: patient.data.address ?? '',
        }
      : undefined,
  });

  // What she types wins; otherwise the merge target's number, otherwise the next free number.
  const mrn = typedMrn ?? (mergeTarget ? (mergeTarget.mrn ?? '') : (suggestion.data ?? ''));

  const fail = (e: unknown) => setError(rpcErrorKey(e as { message?: string; code?: string }));

  const saveDetails = handleSubmit(async (values) => {
    if (!id) return;
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        id,
        values: {
          full_name: values.full_name,
          phone: values.phone,
          email: values.email,
          dob: values.dob,
          address: values.address,
        },
      });
      setSaved(true);
    } catch (e) {
      fail(e);
    }
  });

  async function confirm() {
    if (!id) return;
    setError(null);
    try {
      await verify.mutateAsync({ patient: id, mrn: mrn.trim(), mergeInto: mergeTarget?.id });
      router.replace('/reception/verify');
    } catch (e) {
      fail(e);
    }
  }

  return (
    <Screen edges={[]} title={t('verifyPatient.title')}>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <QueryState
        isPending={patient.isPending}
        isError={patient.isError}
        onRetry={() => void patient.refetch()}
        isEmpty={!patient.data}
        emptyIcon="account-check-outline"
        emptyTitle={t('verifyPatient.gone')}
        emptyMessage={t('verifyPatient.goneHint')}
      >
        <InfoBanner message={t('verifyPatient.checkId')} icon="card-account-details-outline" />

        <SectionHeader title={t('verifyPatient.details')} />
        {saved ? (
          <InfoBanner
            tone="success"
            message={t('verifyPatient.saved')}
            icon="check-circle-outline"
          />
        ) : null}
        <FormField control={control} name="full_name" label={t('fields.fullName')} />
        <FormField
          control={control}
          name="phone"
          label={t('fields.phone')}
          keyboardType="phone-pad"
        />
        <FormField
          control={control}
          name="email"
          label={t('fields.email')}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <DateField
          control={control}
          name="dob"
          label={t('fields.dob')}
          minimumDate={addDays(today, -60 * 365)}
          maximumDate={addDays(today, -12 * 365)}
        />
        <FormField control={control} name="address" label={t('fields.address')} />
        <Button
          label={t('verifyPatient.saveDetails')}
          variant="secondary"
          loading={update.isPending}
          onPress={() => void saveDetails()}
        />

        <SectionHeader title={t('verifyPatient.mrnTitle')} />
        {mergeTarget ? (
          <Card
            variant="soft"
            title={t('verifyPatient.mergeInto', { name: mergeTarget.full_name })}
            subtitle={[mergeTarget.mrn, mergeTarget.phone].filter(Boolean).join(' · ')}
          >
            <Button
              label={t('verifyPatient.mergeCancel')}
              variant="text"
              onPress={() => {
                setMergeTarget(null);
                setTypedMrn(null);
              }}
            />
          </Card>
        ) : null}
        <TextInput
          mode="outlined"
          label={t('fields.mrn')}
          value={mrn}
          onChangeText={setTypedMrn}
          autoCapitalize="characters"
          disabled={!!mergeTarget?.mrn}
          style={{ backgroundColor: palette.white }}
          accessibilityLabel={t('fields.mrn')}
        />

        {!mergeTarget ? (
          picking ? (
            <Card title={t('verifyPatient.mergeSearch')} subtitle={t('verifyPatient.mergeHint')}>
              <PatientPicker
                deskRecordsOnly
                label={t('verifyPatient.mergeSearchLabel')}
                onSelect={(p) => {
                  setMergeTarget(p);
                  setTypedMrn(null);
                  setPicking(false);
                }}
              />
              <Button
                label={t('actions.cancel')}
                variant="text"
                onPress={() => setPicking(false)}
              />
            </Card>
          ) : (
            <Button
              label={t('verifyPatient.mergeStart')}
              variant="secondary"
              onPress={() => setPicking(true)}
            />
          )
        ) : null}

        <Button
          label={mergeTarget ? t('verifyPatient.verifyMerge') : t('verifyPatient.verify')}
          disabled={mrn.trim().length === 0}
          loading={verify.isPending}
          onPress={() => void confirm()}
        />
      </QueryState>
    </Screen>
  );
}
