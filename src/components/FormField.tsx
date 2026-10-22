import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { palette, radius } from './theme';

type TextInputProps = ComponentProps<typeof TextInput>;

export interface FormFieldProps<T extends FieldValues, TOut = T> extends Omit<
  TextInputProps,
  'value' | 'onChangeText' | 'onBlur' | 'error' | 'label'
> {
  control: Control<T, any, TOut>;
  name: FieldPath<T>;
  label: string;
  /** Helper text shown under the field when there is no error. */
  hint?: string;
}

/**
 * Text input bound to react-hook-form. Validation messages from zod schemas are i18n keys
 * (namespace 'common', e.g. 'validation.required') and are translated here.
 *
 *   const { control, handleSubmit } = useForm({ resolver: zodResolver(schema) });
 *   <FormField control={control} name="email" label={t('auth.email')} keyboardType="email-address" />
 */
export function FormField<T extends FieldValues, TOut = T>({
  control,
  name,
  label,
  hint,
  ...inputProps
}: FormFieldProps<T, TOut>) {
  const { t } = useTranslation();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
        <View>
          <TextInput
            mode="outlined"
            label={label}
            value={value == null ? '' : String(value)}
            onChangeText={onChange}
            onBlur={onBlur}
            error={!!error}
            outlineStyle={styles.outline}
            style={styles.input}
            accessibilityLabel={label}
            {...inputProps}
          />
          <HelperText type={error ? 'error' : 'info'} visible={!!error || !!hint}>
            {error?.message ? t(error.message) : hint}
          </HelperText>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  outline: { borderRadius: radius.sm },
  input: { backgroundColor: palette.white },
});
