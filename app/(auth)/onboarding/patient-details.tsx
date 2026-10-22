import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Checkbox, SegmentedButtons } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, DateField, FormField, InfoBanner, Screen } from '@/components';
import { addDays, todayISO } from '@/domain/pregnancy-math';
import { rpcErrorKey } from '@/domain/rpc-errors';
import {
  patientDetailsSchema,
  pregnancyDateBounds,
  toCompleteSignupDetails,
  type PatientDetailsForm,
} from '@/domain/schemas/onboarding';
import { refreshProfile } from '@/features/auth/session-bootstrap';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Patient self-registration (PLAN.md §7.1, §8.3) -> complete_signup('patient', ...). */
export default function PatientDetails() {
  const { t } = useTranslation();
  const today = todayISO();
  const schema = useMemo(() => patientDetailsSchema(today), [today]);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<
    PatientDetailsForm,
    unknown,
    PatientDetailsForm
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      phone: '',
      date_kind: 'lmp',
      date: '',
      first_pregnancy: true,
      allergies: '',
      chronic_conditions: '',
    },
  });
  const dateKind = useWatch({ control, name: 'date_kind' });
  const bounds = pregnancyDateBounds(dateKind, today);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const { error: rpcError } = await supabase.rpc('complete_signup', {
      p_kind: 'patient',
      p_details: toCompleteSignupDetails(values),
    });
    if (rpcError) {
      setError(rpcErrorKey(rpcError));
      return;
    }
    // After the role changes, the role router opens the patient's first-booking step.
    useSession.setState({ nextPath: '/patient/first-booking' });
    await refreshProfile();
  });

  return (
    <Screen title={t('onboarding.detailsTitle')}>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <FormField
        control={control}
        name="full_name"
        label={t('onboarding.fullName')}
        autoComplete="name"
      />
      <DateField
        control={control}
        name="dob"
        label={t('onboarding.dob')}
        minimumDate={addDays(today, -60 * 365)}
        maximumDate={addDays(today, -12 * 365)}
      />
      <FormField
        control={control}
        name="phone"
        label={t('onboarding.phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Controller
        control={control}
        name="date_kind"
        render={({ field: { value, onChange } }) => (
          <SegmentedButtons
            value={value}
            onValueChange={onChange}
            buttons={[
              { value: 'lmp', label: t('onboarding.dateKindLmp') },
              { value: 'edd', label: t('onboarding.dateKindEdd') },
            ]}
          />
        )}
      />
      <DateField
        control={control}
        name="date"
        label={dateKind === 'lmp' ? t('onboarding.lmp') : t('onboarding.edd')}
        minimumDate={bounds.min}
        maximumDate={bounds.max}
      />
      <Controller
        control={control}
        name="first_pregnancy"
        render={({ field: { value, onChange } }) => (
          <Checkbox.Item
            label={t('onboarding.firstPregnancy')}
            status={value ? 'checked' : 'unchecked'}
            onPress={() => onChange(!value)}
            position="leading"
          />
        )}
      />
      <FormField
        control={control}
        name="allergies"
        label={t('onboarding.allergies')}
        hint={t('onboarding.listHint')}
      />
      <FormField
        control={control}
        name="chronic_conditions"
        label={t('onboarding.conditions')}
        hint={t('onboarding.listHint')}
      />
      <Button
        label={t('onboarding.submit')}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
      />
    </Screen>
  );
}
