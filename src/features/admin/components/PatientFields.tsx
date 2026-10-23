import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { DateField, FormField } from '@/components';
import { addDays, todayISO } from '@/domain/pregnancy-math';

import { BLOOD_GROUPS, type NewPatientForm } from '../schemas';
import { ChoiceChips } from './ChoiceChips';
import { SwitchRow } from './SwitchRow';

interface Props {
  control: Control<NewPatientForm, unknown, NewPatientForm>;
}

/** Demographic inputs shared by "new patient" and "edit patient". */
export function PatientFields({ control }: Props) {
  const { t } = useTranslation('admin');
  const today = todayISO();
  return (
    <>
      <FormField
        control={control}
        name="full_name"
        label={t('patient.fullName')}
        autoComplete="name"
      />
      <FormField
        control={control}
        name="mrn"
        label={t('patient.mrn')}
        autoCapitalize="characters"
      />
      <DateField
        control={control}
        name="dob"
        label={t('patient.dob')}
        minimumDate={addDays(today, -70 * 365)}
        maximumDate={addDays(today, -10 * 365)}
      />
      <FormField
        control={control}
        name="phone"
        label={t('patient.phone')}
        keyboardType="phone-pad"
      />
      <FormField
        control={control}
        name="email"
        label={t('patient.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        hint={t('patient.emailHint')}
      />
      <FormField control={control} name="address" label={t('patient.address')} multiline />
      <Controller
        control={control}
        name="blood_group"
        render={({ field }) => (
          <ChoiceChips
            value={(field.value ?? '') as (typeof BLOOD_GROUPS)[number] | ''}
            onChange={(v) => field.onChange(field.value === v ? '' : v)}
            accessibilityLabel={t('patient.bloodGroup')}
            options={BLOOD_GROUPS.map((g) => ({ value: g, label: g }))}
          />
        )}
      />
      <Controller
        control={control}
        name="rh_negative"
        render={({ field }) => (
          <SwitchRow
            label={t('patient.rhNegative')}
            value={field.value === true}
            onChange={field.onChange}
          />
        )}
      />
      <FormField
        control={control}
        name="allergies"
        label={t('patient.allergies')}
        hint={t('patient.listHint')}
      />
      <FormField
        control={control}
        name="chronic_conditions"
        label={t('patient.conditions')}
        hint={t('patient.listHint')}
      />
      <FormField control={control} name="emergency_contact" label={t('patient.emergencyContact')} />
    </>
  );
}
