import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  ChoiceChips,
  palette,
  QueryBoundary,
  Screen,
  spacing,
  StatusChip,
} from '@/components';
import { SearchField } from '@/features/admin/components/SearchField';
import { SwitchRow } from '@/features/admin/components/SwitchRow';
import { useStaff } from '@/features/admin/hooks';
import { defaultStaffFilter, filterStaff, type StaffFilter } from '@/features/admin/users';

/** Users (PLAN.md §7.6 #2): staff accounts. */
export default function Users() {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const query = useStaff();
  const [filter, setFilter] = useState<StaffFilter>(defaultStaffFilter);

  return (
    <Screen scroll={false} edges={[]} contentStyle={styles.screen}>
      <Stack.Screen options={{ title: t('users.title') }} />
      <SearchField
        value={filter.search}
        onChangeText={(search) => setFilter({ ...filter, search })}
        placeholder={t('users.search')}
      />
      <ChoiceChips
        allowClear={false}
        value={filter.role}
        onChange={(role) => role !== '' && setFilter({ ...filter, role })}
        options={[
          { value: 'all', label: t('users.all') },
          { value: 'doctor', label: t('users.doctors') },
          { value: 'receptionist', label: t('users.reception') },
          { value: 'admin', label: t('users.admins') },
        ]}
      />
      <SwitchRow
        label={t('users.showInactive')}
        value={filter.showInactive}
        onChange={(showInactive) => setFilter({ ...filter, showInactive })}
      />
      <Button label={t('users.add')} onPress={() => router.push('/admin/users/new')} />
      <View style={styles.list}>
        <QueryBoundary
          query={query}
          isEmpty={(rows) => filterStaff(rows, filter).length === 0}
          empty={{
            title: t('users.empty'),
            message: t('users.emptyHint'),
            icon: 'account-search-outline',
          }}
        >
          {(rows) => (
            <FlatList
              data={filterStaff(rows, filter)}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.items}
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              renderItem={({ item }) => (
                <Card
                  title={item.full_name ?? item.email ?? '-'}
                  subtitle={[t(`roles.${item.role}`), item.email].filter(Boolean).join(' · ')}
                  onPress={() => router.push(`/admin/users/${item.id}` as never)}
                  right={
                    item.is_active ? null : (
                      <StatusChip label={t('users.inactive')} tone="neutral" />
                    )
                  }
                />
              )}
            />
          )}
        </QueryBoundary>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm },
  list: { flex: 1, backgroundColor: palette.cream },
  items: { gap: spacing.sm, paddingBottom: spacing.lg },
});
