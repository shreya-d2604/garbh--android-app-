import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { HelperText, Text } from 'react-native-paper';

import { FormField, palette } from '@/components';

import type { FieldDef, FormValues } from '../config';
import { ChoiceChips } from './ChoiceChips';
import { KeyValue } from './KeyValue';
import { SwitchRow } from './SwitchRow';

interface Props {
  /** i18n group: labels live at admin:config.fields.<group>.<key>. */
  group: string;
  fields: readonly FieldDef[];
  control: Control<FormValues>;
  /** Editing an existing row: primary-key fields are shown read-only. */
  editing: boolean;
}

/** Renders the inputs of a configuration editor from its FieldDefs. */
export function ConfigFields({ group, fields, control, editing }: Props) {
  const { t, i18n } = useTranslation('admin');
  const label = (key: string) => t(`config.fields.${group}.${key}`);
  const hintKey = (key: string) => `config.hints.${group}.${key}`;
  const hint = (key: string) =>
    i18n.exists(`admin:${hintKey(key)}`) ? t(hintKey(key)) : undefined;
  const optionLabel = (key: string, option: string) => {
    const k = `config.options.${key}.${option}`;
    return i18n.exists(`admin:${k}`) ? t(k) : option;
  };

  return (
    <>
      {fields.map((f) => {
        if (editing && f.createOnly) {
          return (
            <Controller
              key={f.key}
              control={control}
              name={f.key}
              render={({ field }) => (
                <KeyValue label={label(f.key)} value={String(field.value ?? '')} />
              )}
            />
          );
        }
        if (f.kind === 'bool') {
          return (
            <Controller
              key={f.key}
              control={control}
              name={f.key}
              render={({ field }) => (
                <SwitchRow
                  label={label(f.key)}
                  value={field.value === true}
                  onChange={field.onChange}
                />
              )}
            />
          );
        }
        if (f.kind === 'select') {
          const options = (f.allowEmpty ? ['', ...(f.options ?? [])] : (f.options ?? [])).map(
            (o) => ({
              value: o,
              label: o === '' ? t('config.none') : optionLabel(f.key, o),
            }),
          );
          return (
            <Controller
              key={f.key}
              control={control}
              name={f.key}
              render={({ field, fieldState }) => (
                <>
                  <FormFieldLabel text={label(f.key)} error={fieldState.error?.message} />
                  <ChoiceChips
                    options={options}
                    value={String(field.value ?? '')}
                    onChange={field.onChange}
                    accessibilityLabel={label(f.key)}
                  />
                </>
              )}
            />
          );
        }
        const multiline = f.kind === 'multiline' || f.kind === 'json';
        return (
          <FormField
            key={f.key}
            control={control}
            name={f.key}
            label={label(f.key)}
            hint={
              hint(f.key) ??
              (f.kind === 'list' || f.kind === 'intlist' ? t('config.listHint') : undefined)
            }
            multiline={multiline}
            numberOfLines={multiline ? (f.kind === 'json' ? 5 : 3) : 1}
            keyboardType={f.kind === 'int' || f.kind === 'decimal' ? 'numeric' : 'default'}
            autoCapitalize={f.kind === 'text' && f.caseMode ? 'none' : undefined}
            autoCorrect={f.kind === 'json' ? false : undefined}
          />
        );
      })}
    </>
  );
}

function FormFieldLabel({ text, error }: { text: string; error?: string }) {
  const { t } = useTranslation();
  return (
    <>
      <Text variant="labelLarge" style={styles.label}>
        {text}
      </Text>
      {error ? <HelperText type="error">{t(error)}</HelperText> : null}
    </>
  );
}

const styles = StyleSheet.create({ label: { color: palette.inkMuted } });
