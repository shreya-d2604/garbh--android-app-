import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { isISODate, todayISO, type ISODate } from '@/domain/pregnancy-math';

import { palette, radius } from './theme';

export interface DateFieldProps<T extends FieldValues, TOut = T> {
  control: Control<T, any, TOut>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  minimumDate?: ISODate;
  maximumDate?: ISODate;
}

const toDate = (iso: ISODate) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** Date picker bound to react-hook-form. The form value is an ISO date string 'YYYY-MM-DD'. */
export function DateField<T extends FieldValues, TOut = T>({
  control,
  name,
  label,
  hint,
  minimumDate,
  maximumDate,
}: DateFieldProps<T, TOut>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const iso = typeof value === 'string' && isISODate(value) ? value : null;
        const onPick = (event: DateTimePickerEvent, date?: Date) => {
          setOpen(false);
          if (event.type === 'set' && date) onChange(todayISO(date));
        };
        return (
          <View>
            <Pressable
              onPress={() => setOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <View pointerEvents="none">
                <TextInput
                  mode="outlined"
                  label={label}
                  value={iso ? format(toDate(iso), 'd MMM yyyy') : ''}
                  editable={false}
                  error={!!error}
                  right={<TextInput.Icon icon="calendar" />}
                  outlineStyle={styles.outline}
                  style={styles.input}
                />
              </View>
            </Pressable>
            <HelperText type={error ? 'error' : 'info'} visible={!!error || !!hint}>
              {error?.message ? t(error.message) : hint}
            </HelperText>
            {open ? (
              <DateTimePicker
                mode="date"
                value={iso ? toDate(iso) : toDate(maximumDate ?? todayISO())}
                minimumDate={minimumDate ? toDate(minimumDate) : undefined}
                maximumDate={maximumDate ? toDate(maximumDate) : undefined}
                onChange={onPick}
              />
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  outline: { borderRadius: radius.sm },
  input: { backgroundColor: palette.white },
});
