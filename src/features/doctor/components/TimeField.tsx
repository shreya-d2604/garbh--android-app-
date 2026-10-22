import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { palette, radius } from '@/components';

import { formatTime, parseTime } from '../schedule';

export interface TimeFieldProps<T extends FieldValues, TOut = T> {
  control: Control<T, any, TOut>;
  name: FieldPath<T>;
  label: string;
}

/** Time picker bound to react-hook-form; the form value is "HH:MM" (24-hour). */
export function TimeField<T extends FieldValues, TOut = T>({
  control,
  name,
  label,
}: TimeFieldProps<T, TOut>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const minutes = typeof value === 'string' ? parseTime(value) : null;
        const current = new Date();
        current.setHours(Math.floor((minutes ?? 540) / 60), (minutes ?? 540) % 60, 0, 0);
        const onPick = (event: DateTimePickerEvent, date?: Date) => {
          setOpen(false);
          if (event.type === 'set' && date)
            onChange(formatTime(date.getHours() * 60 + date.getMinutes()));
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
                  value={minutes === null ? '' : formatTime(minutes)}
                  editable={false}
                  error={!!error}
                  right={<TextInput.Icon icon="clock-outline" />}
                  outlineStyle={styles.outline}
                  style={styles.input}
                />
              </View>
            </Pressable>
            <HelperText type="error" visible={!!error}>
              {error?.message ? t(error.message) : ''}
            </HelperText>
            {open ? (
              <DateTimePicker mode="time" is24Hour value={current} onChange={onPick} />
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
