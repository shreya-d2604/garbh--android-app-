import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, InfoBanner, ListItem, Screen } from '@/components';
import type { PatientListItem } from '@/features/admin/api';
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog';
import { QueryBoundary } from '@/features/admin/components/QueryBoundary';
import { SearchField } from '@/features/admin/components/SearchField';
import { firstParam, useDebounced } from '@/features/admin/components/ui';
import { adminErrorKey } from '@/features/admin/errors';
import { useMergePatients, usePatient, usePatients } from '@/features/admin/hooks';

/** Merge a duplicate record INTO another one (reception's merge_patients). */
export default function MergePatient() {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const id = firstParam(useLocalSearchParams<{ id: string }>().id);
  const source = usePatient(id);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const candidates = usePatients(term, 'all');
  const merge = useMergePatients();
  const [target, setTarget] = useState<PatientListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = () => {
    if (!target) return;
    setError(null);
    merge.mutate(
      { source: id, target: target.id },
      {
        onSuccess: () => router.replace(`/admin/patients/${target.id}` as never),
        onError: (e) => {
          setError(adminErrorKey(e));
          setTarget(null);
        },
      },
    );
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('patients.merge') }} />
      <InfoBanner message={t('patients.mergeHint', { name: source.data?.full_name ?? '' })} />
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <SearchField value={search} onChangeText={setSearch} placeholder={t('patients.mergeSearch')} />
      <View>
        <QueryBoundary
          query={candidates}
          isEmpty={(rows) => rows.filter((r) => r.id !== id).length === 0}
          empty={{ title: t('patients.empty'), icon: 'account-search-outline' }}
        >
          {(rows) => (
            <Card>
              {rows
                .filter((r) => r.id !== id)
                .map((r) => (
                  <ListItem
                    key={r.id}
                    icon="account-arrow-left-outline"
                    title={r.full_name}
                    description={[r.mrn ?? t('patients.noMrn'), r.phone].filter(Boolean).join(' · ')}
                    onPress={() => setTarget(r)}
                  />
                ))}
            </Card>
          )}
        </QueryBoundary>
      </View>
      <ConfirmDialog
        visible={target !== null}
        title={t('patients.mergeConfirmTitle')}
        message={t('patients.mergeConfirm', {
          source: source.data?.full_name ?? '',
          target: target?.full_name ?? '',
        })}
        confirmLabel={t('patients.merge')}
        danger
        loading={merge.isPending}
        onDismiss={() => setTarget(null)}
        onConfirm={onConfirm}
      />
    </Screen>
  );
}
