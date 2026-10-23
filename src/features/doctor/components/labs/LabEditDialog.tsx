import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ScrollView, StyleSheet } from 'react-native';
import { Dialog, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, FormField, palette, spacing } from '@/components';

import { labFormSchema, type LabFormValues } from '../../lab-form';
import type { LabTestRow } from '../../types';
import { ChoiceChips } from '../ChoiceChips';
import { ErrorBanner } from '../ErrorBanner';
import { SwitchRow } from '../SwitchRow';

export interface LabEditDialogProps {
  visible: boolean;
  tests: readonly LabTestRow[];
  initial: LabFormValues;
  /** Adding a new value (test can be chosen; offers "verified"). */
  adding: boolean;
  saving: boolean;
  error: unknown;
  onSubmit: (values: LabFormValues, verify: boolean) => void;
  onDismiss: () => void;
}

/** Add or correct a lab value: pick the test, type the value; unit and range come from the catalog. */
export function LabEditDialog({
  visible,
  tests,
  initial,
  adding,
  saving,
  error,
  onSubmit,
  onDismiss,
}: LabEditDialogProps) {
  const { t } = useTranslation('doctor');
  const { control, handleSubmit, reset } = useForm<LabFormValues, unknown, LabFormValues>({
    resolver: zodResolver(labFormSchema),
    defaultValues: initial,
  });
  const [verify, setVerify] = useState(true);
  useEffect(() => {
    if (visible) reset(initial);
  }, [visible, initial, reset]);
  const testCode = useWatch({ control, name: 'test_code' });
  const test = tests.find((x) => x.code === testCode);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{adding ? t('labs.addTitle') : t('labs.editTitle')}</Dialog.Title>
        <Dialog.ScrollArea style={styles.scroll}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Controller
              control={control}
              name="test_code"
              render={({ field: { value, onChange }, fieldState: { error: e } }) => (
                <>
                  <ChoiceChips
                    allowClear={false}
                    value={value}
                    onChange={onChange}
                    options={tests.map((x) => ({ value: x.code, label: x.name }))}
                  />
                  {e ? <Text style={styles.error}>{t('common:validation.required')}</Text> : null}
                </>
              )}
            />
            <FormField
              control={control}
              name="value"
              label={t('labs.value')}
              keyboardType="default"
            />
            <FormField
              control={control}
              name="unit"
              label={t('labs.unit')}
              hint={test?.unit ? t('labs.unitHint', { unit: test.unit }) : undefined}
            />
            {adding ? (
              <SwitchRow
                label={t('labs.verified')}
                hint={t('labs.verifiedHint')}
                value={verify}
                onChange={setVerify}
              />
            ) : null}
            <ErrorBanner error={error} />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button label={t('common:actions.cancel')} variant="text" onPress={onDismiss} />
          <Button
            label={t('common:actions.save')}
            fullWidth={false}
            loading={saving}
            onPress={() => void handleSubmit((v) => onSubmit(v, verify))()}
          />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 440 },
  body: { gap: spacing.sm, paddingVertical: spacing.sm },
  error: { color: palette.danger },
});
