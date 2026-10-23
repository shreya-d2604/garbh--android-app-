import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Searchbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  palette,
  spacing,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import { ChoiceChips } from '@/features/doctor/components/ChoiceChips';
import { PatientRow } from '@/features/doctor/components/PatientRow';
import { usePatientList } from '@/features/doctor/hooks';
import {
  applyPatientFilters,
  DEFAULT_PATIENT_FILTERS,
  hasActiveFilters,
  type PatientFilters,
} from '@/features/doctor/patient-list';

/** Patients: only people whose care team includes this doctor (RLS), with search and filters. */
export default function PatientsScreen() {
  const { t } = useTranslation('doctor');
  const router = useRouter();
  const list = usePatientList();
  const [filters, setFilters] = useState<PatientFilters>(DEFAULT_PATIENT_FILTERS);
  const patch = (p: Partial<PatientFilters>) => setFilters((f) => ({ ...f, ...p }));

  const shown = useMemo(
    () => applyPatientFilters(list.data ?? [], filters, todayISO()),
    [list.data, filters],
  );

  if (list.isPending)
    return (
      <Screen edges={[]}>
        <LoadingState />
      </Screen>
    );
  if (list.isError)
    return (
      <Screen edges={[]}>
        <ErrorState onRetry={() => void list.refetch()} />
      </Screen>
    );

  const header = (
    <View style={styles.header}>
      <Searchbar
        value={filters.query}
        onChangeText={(query) => patch({ query })}
        placeholder={t('patients.search')}
        accessibilityLabel={t('patients.search')}
        style={styles.search}
        inputStyle={styles.searchInput}
      />
      <ChoiceChips
        scroll
        allowClear={false}
        value={filters.role}
        onChange={(role) => patch({ role: role === '' ? 'all' : role })}
        options={[
          { value: 'all', label: t('patients.role.all') },
          { value: 'primary', label: t('patients.role.primary') },
          { value: 'backup', label: t('patients.role.backup') },
        ]}
      />
      <ChoiceChips
        scroll
        allowClear
        value={filters.trimester ?? ''}
        onChange={(v) => patch({ trimester: v === '' ? null : (v as 1 | 2 | 3) })}
        options={[
          { value: 1, label: t('patients.trimester', { n: 1 }) },
          { value: 2, label: t('patients.trimester', { n: 2 }) },
          { value: 3, label: t('patients.trimester', { n: 3 }) },
        ]}
      />
      <View style={styles.toggles}>
        <ChoiceChips
          allowClear
          value={filters.highRisk ? 'high' : ''}
          onChange={(v) => patch({ highRisk: v === 'high' })}
          options={[{ value: 'high', label: t('patients.filter.highRisk') }]}
        />
        <ChoiceChips
          allowClear
          value={filters.overdueOnly ? 'overdue' : ''}
          onChange={(v) => patch({ overdueOnly: v === 'overdue' })}
          options={[{ value: 'overdue', label: t('patients.filter.overdue') }]}
        />
        <ChoiceChips
          allowClear
          value={filters.closed ? 'closed' : ''}
          onChange={(v) => patch({ closed: v === 'closed' })}
          options={[{ value: 'closed', label: t('patients.filter.closed') }]}
        />
      </View>
    </View>
  );

  return (
    <Screen edges={[]} scroll={false} contentStyle={styles.screen}>
      <FlatList
        data={shown}
        keyExtractor={(i) => i.pregnancyId}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshing={list.isRefetching}
        onRefresh={() => void list.refetch()}
        renderItem={({ item }) => (
          <PatientRow
            item={item}
            onPress={(p) => router.push(`/doctor/patient/${p.pregnancyId}`)}
          />
        )}
        ListEmptyComponent={
          hasActiveFilters(filters) ? (
            <View>
              <EmptyState
                icon="account-search-outline"
                title={t('patients.noMatch')}
                message={t('patients.noMatchMessage')}
              />
              <Button
                label={t('patients.clearFilters')}
                variant="secondary"
                onPress={() => setFilters(DEFAULT_PATIENT_FILTERS)}
              />
            </View>
          ) : (
            <EmptyState
              icon="account-group-outline"
              title={t('patients.emptyTitle')}
              message={t('patients.emptyMessage')}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  header: { gap: spacing.sm, paddingBottom: spacing.sm },
  search: { backgroundColor: palette.white, borderRadius: 16 },
  searchInput: { minHeight: 48 },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
