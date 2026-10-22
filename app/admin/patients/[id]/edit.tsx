import { zodResolver } from '@hookform/resolvers/zod';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, InfoBanner, Screen } from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import type { PatientRow } from '@/features/admin/api';
import { PatientFields } from '@/features/admin/components/PatientFields';
import { QueryBoundary } from '@/features/admin/components/QueryBoundary';
import { firstParam } from '@/features/admin/components/ui';
import { adminErrorKey } from '@/features/admin/errors';
import { joinList } from '@/features/admin/format';
import { usePatient, useUpdatePatient } from '@/features/admin/hooks';
import { newPatientSchema, toPatientUpdate, type NewPatientForm } from '@/features/admin/schemas';

export default function EditPatient() {
  const { t } = useTranslation('admin');
  const id = firstParam(useLocalSearchParams<{ id: string }>().id);
  const query = usePatient(id);
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('patients.edit') }} />
      <QueryBoundary
        query={query}
        isEmpty={(p) => p === null}
        empty={{ title: t('patients.notFound'), icon: 'account-question-outline' }}
      >
        {(patient) => (patient ? <EditForm patient={patient} /> : null)}
      </QueryBoundary>
    </Screen>
  );
}

function EditForm({ patient }: { patient: PatientRow }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const update = useUpdatePatient();
  const [error, setError] = useState<string | null>(null);
  // Same fields as "new patient"; the pregnancy inputs are simply not shown here.
  const schema = useMemo(() => newPatientSchema(todayISO()), []);
  const { control, handleSubmit, formState } = useForm<NewPatientForm, unknown, NewPatientForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: patient.full_name,
      mrn: patient.mrn ?? '',
      dob: patient.dob ?? '',
      phone: patient.phone ?? '',
      email: patient.email ?? '',
      address: patient.address ?? '',
      blood_group: (patient.blood_group ?? '') as NewPatientForm['blood_group'],
      rh_negative: patient.rh_negative ?? false,
      allergies: joinList(patient.allergies),
      chronic_conditions: joinList(patient.chronic_conditions),
      emergency_contact: patient.emergency_contact ?? '',
      lmp_date: '',
      primary_doctor: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await update.mutateAsync({ id: patient.id, values: toPatientUpdate(values) });
      router.back();
    } catch (e) {
      setError(adminErrorKey(e as Error));
    }
  });

  return (
    <>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <PatientFields control={control} />
      <Button label={t('actions.save', { ns: 'common' })} onPress={() => void onSubmit()} loading={formState.isSubmitting} />
    </>
  );
}
