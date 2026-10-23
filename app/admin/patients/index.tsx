import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  InfoBanner,
  palette,
  QueryBoundary,
  Screen,
  spacing,
  StatusChip,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import type { PatientFilter, PatientListItem } from '@/features/admin/api';
import { ChoiceChips } from '@/features/admin/components/ChoiceChips';
import { SearchField } from '@/features/admin/components/SearchField';
import { firstParam, useDebounced } from '@/features/admin/components/ui';
import { gaLabel } from '@/features/admin/format';
import { usePatients } from '@/features/admin/hooks';

const FILTERS: PatientFilter[] = ['all', 'unverified', 'deleted'];

/** Patients & pregnancies (PLAN.md §7.6 #3). */
export default function Patients() {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string; deleted?: string }>();
  const initial = firstParam(params.filter);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PatientFilter>(
    FILTERS.includes(initial as PatientFilter) ? (initial as PatientFilter) : 'all',
  );
  const term = useDebounced(search);
  const query = usePatients(term, filter);
  const deleted = firstParam(params.deleted);

  return (
    <Screen scroll={false} edges={[]} contentStyle={styles.screen}>
      <Stack.Screen options={{ title: t('patients.title') }} />
      {deleted === 'files' ? (
        <InfoBanner tone="warning" message={t('patients.deletedFilesLeft')} />
      ) : null}
      {deleted === '1' ? (
        <InfoBanner
          tone="success"
          icon="check-circle-outline"
          message={t('patients.deletedForever')}
        />
      ) : null}
      <SearchField value={search} onChangeText={setSearch} placeholder={t('patients.search')} />
      <ChoiceChips
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f, label: t(`patients.filter.${f}`) }))}
      />
      <Button label={t('patients.add')} onPress={() => router.push('/admin/patients/new')} />
      <View style={styles.list}>
        <QueryBoundary
          query={query}
          isEmpty={(rows) => rows.length === 0}
          empty={{
            title: t('patients.empty'),
            message: t('patients.emptyHint'),
            icon: 'account-search-outline',
          }}
        >
          {(rows) => (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.items}
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              renderItem={({ item }) => <PatientCard item={item} />}
            />
          )}
        </QueryBoundary>
      </View>
    </Screen>
  );
}

function PatientCard({ item }: { item: PatientListItem }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const active = item.pregnancies.find((p) => p.status === 'active');
  const ga = gaLabel(active?.edd_final, todayISO());
  const subtitle = [
    item.mrn ?? t('patients.noMrn'),
    active ? (ga ? t('patients.ga', { ga }) : t('patients.noDates')) : t('patients.noActive'),
  ].join(' · ');
  return (
    <Card
      title={item.full_name}
      subtitle={subtitle}
      onPress={() => router.push(`/admin/patients/${item.id}` as never)}
      right={
        <View style={styles.chips}>
          {item.deleted_at ? <StatusChip label={t('patients.deleted')} tone="neutral" /> : null}
          {!item.verified_at && !item.deleted_at ? (
            <StatusChip label={t('patients.unverified')} tone="warning" />
          ) : null}
          {active?.risk_level === 'high' ? (
            <StatusChip label={t('patients.highRisk')} tone="danger" />
          ) : null}
          {item.registration_source === 'app' ? (
            <StatusChip label={t('patients.app')} tone="info" />
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm },
  list: { flex: 1, backgroundColor: palette.cream },
  items: { gap: spacing.sm, paddingBottom: spacing.lg },
  chips: { gap: 4, alignItems: 'flex-end' },
});
