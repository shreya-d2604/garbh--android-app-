import { zodResolver } from '@hookform/resolvers/zod';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, FormField, InfoBanner, Screen } from '@/components';
import { ChoiceChips } from '@/features/admin/components/ChoiceChips';
import { StaffFields } from '@/features/admin/components/StaffFields';
import { adminErrorKey } from '@/features/admin/errors';
import { useCreateStaff } from '@/features/admin/hooks';
import { staffCreateSchema, toStaffPayload, type StaffCreateForm } from '@/features/admin/schemas';

/** Create a doctor, receptionist or admin: they get a sign-in code by email. */
export default function NewStaff() {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const create = useCreateStaff();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<StaffCreateForm, unknown, StaffCreateForm>({
    resolver: zodResolver(staffCreateSchema),
    defaultValues: {
      email: '',
      full_name: '',
      role: 'doctor',
      phone: '',
      designation: '',
      specialization: '',
      registration_no: '',
      bio: '',
    },
  });
  const role = useWatch({ control, name: 'role' });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await create.mutateAsync({
        email: values.email,
        role: values.role,
        ...toStaffPayload(values),
      });
      router.replace({
        pathname: '/admin/users/[id]',
        params: { id: result.user_id, invited: result.invite_sent ? 'sent' : 'failed' },
      });
    } catch (e) {
      setError(adminErrorKey(e as Error));
    }
  });

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('users.new') }} />
      <InfoBanner message={t('users.newHint')} />
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <FormField
        control={control}
        name="email"
        label={t('staff.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Controller
        control={control}
        name="role"
        render={({ field }) => (
          <ChoiceChips
            value={field.value}
            onChange={field.onChange}
            accessibilityLabel={t('staff.role')}
            options={[
              { value: 'doctor', label: t('roles.doctor') },
              { value: 'receptionist', label: t('roles.receptionist') },
              { value: 'admin', label: t('roles.admin') },
            ]}
          />
        )}
      />
      <StaffFields control={control} doctor={role === 'doctor'} />
      <Button
        label={t('users.create')}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
      />
    </Screen>
  );
}
