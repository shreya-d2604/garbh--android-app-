import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Checkbox, Chip, HelperText, SegmentedButtons, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  DateField,
  FormField,
  InfoBanner,
  ListItem,
  Screen,
  SectionHeader,
  palette,
  spacing,
} from '@/components';
import { addDays, todayISO } from '@/domain/pregnancy-math';
import { rpcErrorKey } from '@/domain/rpc-errors';
import { pregnancyDateBounds } from '@/domain/schemas/onboarding';
import type { DuplicateMatch } from '@/features/reception/duplicates';
import { DoctorChips } from '@/features/reception/components/DoctorChips';
import { QueryState } from '@/features/reception/components/QueryState';
import {
  useDoctors,
  useDuplicateCheck,
  usePatientContext,
  useRegisterPatient,
} from '@/features/reception/hooks';
import {
  BLOOD_GROUPS,
  registerPatientSchema,
  toRegisterDetails,
  type RegisterPatientForm,
} from '@/features/reception/schemas';

const EMPTY: RegisterPatientForm = {
  full_name: '',
  phone: '',
  email: '',
  dob: '',
  address: '',
  mrn: '',
  blood_group: '',
  allergies: '',
  chronic_conditions: '',
  emergency_contact: '',
  date_kind: 'lmp',
  date: '',
  first_pregnancy: true,
  primary_doctor: '',
  consent: false,
};

/**
 * Register a walk-in patient (PLAN.md §7.5 #1). Saving creates the verified patient, the pregnancy, the
 * primary doctor on the care team and the 12-visit plan in one RPC. The email doubles as the app invite:
 * the patient signs in with it and is linked automatically.
 */
export default function RegisterScreen() {
  const { t } = useTranslation('reception');
  const router = useRouter();
  const today = todayISO();
  const schema = useMemo(() => registerPatientSchema(today), [today]);
  const doctors = useDoctors();
  const duplicateCheck = useDuplicateCheck();
  const register = useRegisterPatient();
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null);
  const [pending, setPending] = useState<RegisterPatientForm | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const created = usePatientContext(createdId ?? undefined);

  const { control, handleSubmit, reset } = useForm<
    RegisterPatientForm,
    unknown,
    RegisterPatientForm
  >({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const dateKind = useWatch({ control, name: 'date_kind' });
  const bounds = pregnancyDateBounds(dateKind, today);
  const fail = (e: unknown) => setError(rpcErrorKey(e as { message?: string; code?: string }));

  async function save(values: RegisterPatientForm) {
    setError(null);
    try {
      const id = await register.mutateAsync(toRegisterDetails(values));
      setCreatedId(id);
      setMatches(null);
      setPending(null);
      reset(EMPTY);
    } catch (e) {
      setMatches(null);
      fail(e);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const found = await duplicateCheck.mutateAsync({
        full_name: values.full_name,
        phone: values.phone,
        email: values.email,
        dob: values.dob,
      });
      if (found.length > 0) {
        setMatches(found);
        setPending(values);
        return;
      }
      await save(values);
    } catch (e) {
      fail(e);
    }
  });

  if (createdId) {
    return (
      <Screen edges={[]} title={t('register.doneTitle')}>
        <QueryState
          isPending={created.isPending}
          isError={created.isError}
          onRetry={() => void created.refetch()}
        >
          <Card
            variant="soft"
            title={created.data?.patient.full_name}
            subtitle={t('register.doneMrn', { mrn: created.data?.patient.mrn })}
          >
            <Text variant="bodyMedium">{t('register.doneMessage')}</Text>
          </Card>
        </QueryState>
        <Button
          label={t('register.bookFirst')}
          onPress={() =>
            router.push({ pathname: '/reception/book', params: { patient: createdId } })
          }
        />
        <Button
          label={t('register.another')}
          variant="secondary"
          onPress={() => setCreatedId(null)}
        />
      </Screen>
    );
  }

  if (matches && pending) {
    return (
      <Screen edges={[]} title={t('register.duplicatesTitle')}>
        <InfoBanner tone="warning" message={t('register.duplicatesMessage')} />
        <Card>
          {matches.map((m) => (
            <ListItem
              key={m.candidate.id}
              icon="account-alert-outline"
              title={m.candidate.full_name}
              description={[
                m.candidate.mrn,
                m.candidate.phone,
                m.reasons.map((r) => t(`register.reason.${r}`)).join(', '),
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </Card>
        <Button label={t('register.goBack')} onPress={() => setMatches(null)} />
        <Button
          label={t('register.registerAnyway')}
          variant="secondary"
          loading={register.isPending}
          onPress={() => void save(pending)}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={[]} title={t('register.title')} subtitle={t('register.subtitle')}>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}

      <FormField
        control={control}
        name="full_name"
        label={t('fields.fullName')}
        autoComplete="name"
      />
      <FormField
        control={control}
        name="phone"
        label={t('fields.phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <FormField
        control={control}
        name="email"
        label={t('fields.email')}
        hint={t('register.emailHint')}
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

      <SectionHeader title={t('register.pregnancy')} />
      <Controller
        control={control}
        name="date_kind"
        render={({ field: { value, onChange } }) => (
          <SegmentedButtons
            value={value}
            onValueChange={onChange}
            buttons={[
              { value: 'lmp', label: t('fields.lmpKind') },
              { value: 'edd', label: t('fields.eddKind') },
            ]}
          />
        )}
      />
      <DateField
        control={control}
        name="date"
        label={dateKind === 'lmp' ? t('fields.lmp') : t('fields.edd')}
        minimumDate={bounds.min}
        maximumDate={bounds.max}
      />
      <Controller
        control={control}
        name="first_pregnancy"
        render={({ field: { value, onChange } }) => (
          <Checkbox.Item
            label={t('fields.firstPregnancy')}
            status={value ? 'checked' : 'unchecked'}
            onPress={() => onChange(!value)}
            position="leading"
          />
        )}
      />

      <SectionHeader title={t('fields.primaryDoctor')} />
      <Controller
        control={control}
        name="primary_doctor"
        render={({ field: { value, onChange }, fieldState: { error: fieldError } }) => (
          <View>
            <QueryState
              isPending={doctors.isPending}
              isError={doctors.isError}
              onRetry={() => void doctors.refetch()}
            >
              <DoctorChips
                doctors={doctors.data ?? []}
                selected={value || undefined}
                onSelect={onChange}
              />
            </QueryState>
            <HelperText type="error" visible={!!fieldError}>
              {fieldError?.message ? t(fieldError.message) : ''}
            </HelperText>
          </View>
        )}
      />

      <SectionHeader title={t('register.medical')} />
      <Controller
        control={control}
        name="blood_group"
        render={({ field: { value, onChange } }) => (
          <View style={styles.wrap}>
            {BLOOD_GROUPS.map((g) => (
              <Chip
                key={g}
                mode="outlined"
                selected={value === g}
                onPress={() => onChange(value === g ? '' : g)}
                style={[styles.chip, value === g && styles.selected]}
                accessibilityLabel={t('fields.bloodGroupOption', { group: g })}
              >
                {g}
              </Chip>
            ))}
          </View>
        )}
      />
      <FormField
        control={control}
        name="allergies"
        label={t('fields.allergies')}
        hint={t('fields.listHint')}
      />
      <FormField
        control={control}
        name="chronic_conditions"
        label={t('fields.conditions')}
        hint={t('fields.listHint')}
      />
      <FormField control={control} name="emergency_contact" label={t('fields.emergency')} />
      <FormField
        control={control}
        name="mrn"
        label={t('fields.mrn')}
        hint={t('register.mrnHint')}
        autoCapitalize="characters"
      />

      <Controller
        control={control}
        name="consent"
        render={({ field: { value, onChange }, fieldState: { error: fieldError } }) => (
          <View>
            <Checkbox.Item
              label={t('register.consent')}
              status={value ? 'checked' : 'unchecked'}
              onPress={() => onChange(!value)}
              position="leading"
            />
            <HelperText type="error" visible={!!fieldError}>
              {fieldError?.message ? t(fieldError.message) : ''}
            </HelperText>
          </View>
        )}
      />
      <Button
        label={t('register.save')}
        loading={duplicateCheck.isPending || register.isPending}
        onPress={() => void onSubmit()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    borderColor: palette.outline,
    backgroundColor: palette.white,
  },
  selected: { backgroundColor: palette.roseSoft, borderColor: palette.rose },
});
