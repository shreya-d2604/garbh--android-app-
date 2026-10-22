import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  EmptyState,
  ErrorState,
  ListItem,
  LoadingState,
  StatusChip,
  palette,
  spacing,
} from '@/components';

import type { PatientSummary } from '../api';
import { usePatientSearch } from '../hooks';

export interface PatientPickerProps {
  onSelect: (patient: PatientSummary) => void;
  /** Only desk records without an app account (merge targets). */
  deskRecordsOnly?: boolean;
  label?: string;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Search patients by name, hospital number or phone. */
export function PatientPicker({ onSelect, deskRecordsOnly, label }: PatientPickerProps) {
  const { t } = useTranslation('reception');
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term, 300);
  const { data, isFetching, isError, refetch } = usePatientSearch(debounced, { deskRecordsOnly });
  const searching = debounced.trim().length >= 2;

  return (
    <View style={styles.box}>
      <TextInput
        mode="outlined"
        label={label ?? t('picker.label')}
        value={term}
        onChangeText={setTerm}
        left={<TextInput.Icon icon="magnify" />}
        autoCapitalize="none"
        style={styles.input}
        accessibilityLabel={label ?? t('picker.label')}
      />
      {!searching ? <EmptyState icon="account-search" title={t('picker.hint')} /> : null}
      {searching && isFetching && !data ? <LoadingState /> : null}
      {searching && isError ? <ErrorState onRetry={() => void refetch()} /> : null}
      {searching && !isError && data && data.length === 0 ? (
        <EmptyState
          icon="account-off-outline"
          title={t('picker.none')}
          message={t('picker.noneHint')}
        />
      ) : null}
      {searching && data
        ? data.map((p) => (
            <ListItem
              key={p.id}
              icon="account"
              title={p.full_name}
              description={[p.mrn, p.phone].filter(Boolean).join(' · ') || t('common.noMrn')}
              right={
                p.verified_at ? undefined : (
                  <StatusChip label={t('tags.unverified')} tone="warning" />
                )
              }
              onPress={() => onSelect(p)}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  input: { backgroundColor: palette.white },
});
