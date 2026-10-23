import { useState } from 'react';
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type UseFormSetValue,
} from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, DateField, FormField, InfoBanner, palette, spacing } from '@/components';
import { todayISO } from '@/domain/pregnancy-math';

import { fetchLastPrescription } from '../../api';
import type { ConsultationFormValues } from '../../consultation';
import { newId } from '../../ids';
import {
  copyFromPrevious,
  DOSAGE_FORMS,
  endDate,
  FREQUENCY_PRESETS,
  newPrescriptionRow,
  ROUTES,
  suggestDrugs,
  TIMING_OPTIONS,
} from '../../prescription';
import type { DrugRow } from '../../types';
import { ChoiceChips } from '../ChoiceChips';

export interface PrescriptionEditorProps {
  control: Control<ConsultationFormValues, unknown, ConsultationFormValues>;
  setValue: UseFormSetValue<ConsultationFormValues>;
  catalog: readonly DrugRow[];
  pregnancyId: string;
  consultationId: string | null;
}

/** Manual prescription entry: one card per drug, catalog autocomplete, "copy from last visit". */
export function PrescriptionEditor({
  control,
  setValue,
  catalog,
  pregnancyId,
  consultationId,
}: PrescriptionEditorProps) {
  const { t } = useTranslation('doctor');
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'prescriptions',
    keyName: 'rhfKey',
  });
  const [copyState, setCopyState] = useState<'idle' | 'loading' | 'none' | 'error'>('idle');

  const addRow = () => append(newPrescriptionRow(newId(), todayISO()));
  const copyLast = async () => {
    setCopyState('loading');
    try {
      const items = await fetchLastPrescription(pregnancyId, consultationId);
      const rows = copyFromPrevious(items, todayISO(), newId);
      if (rows.length === 0) {
        setCopyState('none');
        return;
      }
      append(rows);
      setCopyState('idle');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <Card title={t('consult.prescription')} subtitle={t('consult.prescriptionHint')}>
      {fields.map((field, index) => (
        <PrescriptionRowCard
          key={field.rhfKey}
          index={index}
          control={control}
          setValue={setValue}
          catalog={catalog}
          onRemove={() => remove(index)}
        />
      ))}
      <View style={styles.buttons}>
        <Button label={t('consult.addDrug')} variant="secondary" onPress={addRow} />
        <Button
          label={t('consult.copyLast')}
          variant="text"
          loading={copyState === 'loading'}
          onPress={() => void copyLast()}
        />
      </View>
      {copyState === 'none' ? <InfoBanner tone="info" message={t('consult.copyNone')} /> : null}
      {copyState === 'error' ? <InfoBanner tone="danger" message={t('consult.copyError')} /> : null}
    </Card>
  );
}

function PrescriptionRowCard({
  index,
  control,
  setValue,
  catalog,
  onRemove,
}: {
  index: number;
  control: Control<ConsultationFormValues, unknown, ConsultationFormValues>;
  setValue: UseFormSetValue<ConsultationFormValues>;
  catalog: readonly DrugRow[];
  onRemove: () => void;
}) {
  const { t } = useTranslation('doctor');
  const row = useWatch({ control, name: `prescriptions.${index}` });
  const name = row?.drug_name ?? '';
  const suggestions = suggestDrugs(catalog, name);
  const known = catalog.find((d) => d.name.toLowerCase() === name.trim().toLowerCase());
  const end = row ? endDate(row.start_date, row.duration_days) : null;
  const field = (
    k: 'drug_name' | 'strength' | 'dose' | 'frequency' | 'duration_days' | 'instructions',
  ) => `prescriptions.${index}.${k}` as const;

  const pick = (d: DrugRow) => {
    setValue(field('drug_name'), d.name, { shouldDirty: true, shouldValidate: true });
    if (!row?.strength && d.common_strengths[0]) {
      setValue(field('strength'), d.common_strengths[0], { shouldDirty: true });
    }
  };

  return (
    <View style={styles.row} accessibilityLabel={t('consult.drugN', { n: index + 1 })}>
      <Text variant="labelLarge" style={styles.rowTitle}>
        {t('consult.drugN', { n: index + 1 })}
      </Text>
      <FormField
        control={control}
        name={field('drug_name')}
        label={t('consult.drugName')}
        autoCapitalize="words"
      />
      {suggestions.length > 0 ? (
        <View style={styles.suggestions} accessibilityLabel={t('consult.suggestions')}>
          {suggestions.map((d) => (
            <Chip key={d.id} icon="pill" onPress={() => pick(d)} accessibilityLabel={d.name}>
              {d.name}
            </Chip>
          ))}
        </View>
      ) : null}
      {known?.pregnancy_caution_note ? (
        <InfoBanner tone="warning" icon="alert-outline" message={known.pregnancy_caution_note} />
      ) : null}
      <FormField control={control} name={field('strength')} label={t('consult.strength')} />
      <Controller
        control={control}
        name={`prescriptions.${index}.dosage_form`}
        render={({ field: { value, onChange } }) => (
          <ChoiceChips
            scroll
            value={value}
            onChange={onChange}
            options={DOSAGE_FORMS.map((v) => ({ value: v, label: v }))}
          />
        )}
      />
      <FormField
        control={control}
        name={field('dose')}
        label={t('consult.dose')}
        hint={t('consult.doseHint')}
      />
      <FormField
        control={control}
        name={field('frequency')}
        label={t('consult.frequency')}
        hint={t('consult.frequencyHint')}
        autoCapitalize="characters"
      />
      <Controller
        control={control}
        name={`prescriptions.${index}.frequency`}
        render={({ field: { value, onChange } }) => (
          <ChoiceChips
            scroll
            value={value}
            onChange={onChange}
            options={FREQUENCY_PRESETS.map((v) => ({ value: v, label: v }))}
          />
        )}
      />
      <Controller
        control={control}
        name={`prescriptions.${index}.timing`}
        render={({ field: { value, onChange } }) => (
          <ChoiceChips
            scroll
            value={value}
            onChange={onChange}
            options={TIMING_OPTIONS.map((v) => ({ value: v, label: v }))}
          />
        )}
      />
      <Controller
        control={control}
        name={`prescriptions.${index}.route`}
        render={({ field: { value, onChange } }) => (
          <ChoiceChips
            scroll
            value={value}
            onChange={onChange}
            options={ROUTES.map((v) => ({ value: v, label: v }))}
          />
        )}
      />
      <FormField
        control={control}
        name={field('duration_days')}
        label={t('consult.duration')}
        keyboardType="number-pad"
      />
      <DateField
        control={control}
        name={`prescriptions.${index}.start_date`}
        label={t('consult.startDate')}
      />
      {end ? (
        <Text variant="bodySmall" style={styles.muted}>
          {t('consult.endsOn', { date: end })}
        </Text>
      ) : null}
      <FormField
        control={control}
        name={field('instructions')}
        label={t('consult.instructions')}
        multiline
      />
      <Button
        label={t('consult.removeDrug')}
        variant="text"
        onPress={onRemove}
        accessibilityLabel={t('consult.removeDrugN', { n: index + 1 })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outline,
  },
  rowTitle: { color: palette.maroon },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { gap: spacing.xs },
  muted: { color: palette.inkMuted },
});
