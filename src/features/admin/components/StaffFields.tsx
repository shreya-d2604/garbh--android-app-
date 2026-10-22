import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormField } from '@/components';

import type { StaffCreateForm } from '../schemas';

interface Props {
  // Create and edit forms share these fields; the edit form simply has no email / role.
  control: Control<StaffCreateForm, unknown, StaffCreateForm>;
  /** Doctor-only details (specialization, registration number, bio). */
  doctor: boolean;
}

export function StaffFields({ control, doctor }: Props) {
  const { t } = useTranslation('admin');
  return (
    <>
      <FormField
        control={control}
        name="full_name"
        label={t('staff.fullName')}
        autoComplete="name"
      />
      <FormField control={control} name="phone" label={t('staff.phone')} keyboardType="phone-pad" />
      <FormField control={control} name="designation" label={t('staff.designation')} />
      {doctor ? (
        <>
          <FormField control={control} name="specialization" label={t('staff.specialization')} />
          <FormField control={control} name="registration_no" label={t('staff.registrationNo')} />
          <FormField
            control={control}
            name="bio"
            label={t('staff.bio')}
            multiline
            numberOfLines={3}
          />
        </>
      ) : null}
    </>
  );
}
