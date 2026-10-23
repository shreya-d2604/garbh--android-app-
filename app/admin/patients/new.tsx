import { zodResolver } from '@hookform/resolvers/zod';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, DateField, InfoBanner, Screen, SectionHeader } from '@/components';
import { addDays, todayISO } from '@/domain/pregnancy-math';
import { DoctorChoice } from '@/features/admin/components/DoctorChoice';
import { PatientFields } from '@/features/admin/components/PatientFields';
import { adminErrorKey } from '@/features/admin/errors';
import { useCreatePatient, useDoctors } from '@/features/admin/hooks';
import {
  newPatientSchema,
  toCreatePatientDetails,
  type NewPatientForm,
} from '@/features/admin/schemas';

/** Create a verified desk-style patient record, optionally with her pregnancy and primary doctor. */
export default function NewPatient() {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const today = todayISO();
  const schema = useMemo(() => newPatientSchema(today), [today]);
  const doctors = useDoctors();
  const create = useCreatePatient();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<NewPatientForm, unknown, NewPatientForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      mrn: '',
      dob: '',
      phone: '',
      email: '',
      address: '',
      blood_group: '',
      rh_negative: false,
      allergies: '',
      chronic_conditions: '',
      emergency_contact: '',
      lmp_date: '',
      primary_doctor: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const id = await create.mutateAsync(toCreatePatientDetails(values));
      router.replace(`/admin/patients/${id}` as never);
    } catch (e) {
      setError(adminErrorKey(e as Error));
    }
  });

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('patients.new') }} />
      <InfoBanner message={t('patients.newHint')} />
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <PatientFields control={control} />
      <SectionHeader title={t('patients.pregnancy')} />
      <DateField
        control={control}
        name="lmp_date"
        label={t('pregnancy.lmp')}
        hint={t('patients.lmpOptional')}
        minimumDate={addDays(today, -300)}
        maximumDate={today}
      />
      <SectionHeader title={t('patients.primaryDoctor')} />
      <Controller
        control={control}
        name="primary_doctor"
        render={({ field }) => (
          <DoctorChoice
            doctors={doctors.data ?? []}
            selected={field.value || null}
            onSelect={(id) => field.onChange(field.value === id ? '' : id)}
          />
        )}
      />
      <Button
        label={t('patients.create')}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
      />
    </Screen>
  );
}
