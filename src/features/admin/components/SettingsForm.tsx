import { Stack } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button, InfoBanner, QueryBoundary, Screen } from '@/components';

import {
  SINGLE_CONFIGS,
  buildPayload,
  valuesFromRow,
  type FormValues,
  type Row,
  type SingleConfigKey,
} from '../config';
import { adminErrorKey } from '../errors';
import { useHospitalSettings, useSaveHospitalSettings } from '../hooks';
import { ConfigFields } from './ConfigFields';
import { configResolver } from './configResolver';

/** Hospital settings (single row), edited in two groups: booking rules and hospital details. */
export function SettingsForm({ group }: { group: SingleConfigKey }) {
  const { t } = useTranslation('admin');
  const query = useHospitalSettings();
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t(`config.single.${group}`) }} />
      <QueryBoundary query={query}>{(row) => <Form group={group} row={row} />}</QueryBoundary>
    </Screen>
  );
}

function Form({ group, row }: { group: SingleConfigKey; row: Row }) {
  const { t } = useTranslation('admin');
  const fields = SINGLE_CONFIGS[group].fields;
  const save = useSaveHospitalSettings();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: configResolver(fields),
    defaultValues: valuesFromRow(fields, row),
  });

  const onSubmit = handleSubmit(async (values) => {
    setNotice(null);
    setError(null);
    const built = buildPayload(fields, values);
    if (!built.ok) return;
    try {
      await save.mutateAsync(built.payload);
      setNotice(t('config.saved'));
    } catch (e) {
      setError(adminErrorKey(e as Error));
    }
  });

  return (
    <>
      <InfoBanner message={t(`config.singleHint.${group}`)} />
      {notice ? <InfoBanner tone="success" icon="check-circle-outline" message={notice} /> : null}
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <ConfigFields group={group} fields={fields} control={control} editing={false} />
      <Button
        label={t('actions.save', { ns: 'common' })}
        onPress={() => void onSubmit()}
        loading={formState.isSubmitting}
      />
    </>
  );
}
