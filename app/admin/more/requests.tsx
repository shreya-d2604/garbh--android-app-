import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Share, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  InfoBanner,
  QueryBoundary,
  Screen,
  spacing,
  StatusChip,
  type Tone,
} from '@/components';
import type { RequestFilter, RequestItem } from '@/features/admin/api';
import { ChoiceChips } from '@/features/admin/components/ChoiceChips';
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog';
import { KeyValue } from '@/features/admin/components/KeyValue';
import { ReasonDialog } from '@/features/admin/components/ReasonDialog';
import { adminErrorKey } from '@/features/admin/errors';
import { formatWhen } from '@/features/admin/format';
import {
  useExportData,
  useProcessDeletion,
  useRequests,
  useResolveRequest,
} from '@/features/admin/hooks';

const STATUS_TONE: Record<string, Tone> = {
  open: 'warning',
  in_progress: 'info',
  done: 'success',
  rejected: 'neutral',
};

/** DPDP requests (PLAN.md §7.6 #7): account deletion and data export. */
export default function Requests() {
  const { t } = useTranslation('admin');
  const [filter, setFilter] = useState<RequestFilter>('open');
  const query = useRequests(filter);
  return (
    <Screen scroll={false} edges={[]} contentStyle={styles.screen}>
      <Stack.Screen options={{ title: t('requests.title') }} />
      <InfoBanner message={t('requests.hint')} />
      <ChoiceChips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: t('requests.open') },
          { value: 'closed', label: t('requests.closed') },
        ]}
      />
      <QueryBoundary
        query={query}
        isEmpty={(rows) => rows.length === 0}
        empty={{
          title: t(filter === 'open' ? 'requests.noneOpen' : 'requests.noneClosed'),
          icon: 'inbox-outline',
        }}
      >
        {(rows) => (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            contentContainerStyle={styles.items}
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            renderItem={({ item }) => <RequestCard item={item} />}
          />
        )}
      </QueryBoundary>
    </Screen>
  );
}

function RequestCard({ item }: { item: RequestItem }) {
  const { t } = useTranslation('admin');
  const resolve = useResolveRequest();
  const processDeletion = useProcessDeletion();
  const exportData = useExportData();
  const [dialog, setDialog] = useState<'delete' | 'reject' | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isOpen = item.status === 'open' || item.status === 'in_progress';
  const name = item.requester?.full_name ?? item.requester?.email ?? t('requests.unknownUser');

  const fail = (e: unknown) => {
    setError(adminErrorKey(e as Error));
    setDialog(null);
  };
  const resolveWith = (status: 'in_progress' | 'done' | 'rejected', note?: string) => {
    setError(null);
    resolve.mutate(
      { id: item.id, status, note },
      { onSuccess: () => setDialog(null), onError: fail },
    );
  };

  return (
    <Card
      title={name}
      subtitle={[t(`requests.kind.${item.kind}`), formatWhen(item.created_at)].join(' · ')}
      right={
        <StatusChip
          label={t(`requests.status.${item.status}`)}
          tone={STATUS_TONE[item.status] ?? 'neutral'}
        />
      }
    >
      {item.requester?.email ? (
        <KeyValue label={t('requests.email')} value={item.requester.email} />
      ) : null}
      {item.requester?.role ? (
        <KeyValue label={t('requests.role')} value={t(`roles.${item.requester.role}`)} />
      ) : null}
      {item.note ? <KeyValue label={t('requests.note')} value={item.note} /> : null}
      {notice ? <InfoBanner tone="success" icon="check-circle-outline" message={notice} /> : null}
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}

      {isOpen && item.kind === 'export' ? (
        <>
          <InfoBanner message={t('requests.exportHint')} />
          <Button
            label={t('requests.prepareExport')}
            loading={exportData.isPending}
            onPress={() => {
              setError(null);
              exportData.mutate(
                { userId: item.user_id },
                { onSuccess: (data) => setExported(JSON.stringify(data, null, 2)), onError: fail },
              );
            }}
          />
          <Button
            label={t('requests.markDone')}
            variant="secondary"
            loading={resolve.isPending}
            onPress={() => resolveWith('done')}
          />
        </>
      ) : null}
      {isOpen && item.kind === 'deletion' ? (
        <>
          <InfoBanner tone="warning" message={t('requests.deletionHint')} />
          <Button
            label={t('requests.deleteAccount')}
            variant="danger"
            onPress={() => setDialog('delete')}
          />
        </>
      ) : null}
      {isOpen ? (
        <>
          {item.status === 'open' ? (
            <Button
              label={t('requests.start')}
              variant="text"
              onPress={() => resolveWith('in_progress')}
            />
          ) : null}
          <Button label={t('requests.reject')} variant="text" onPress={() => setDialog('reject')} />
        </>
      ) : null}

      <ConfirmDialog
        visible={dialog === 'delete'}
        title={t('requests.deleteTitle')}
        message={t('requests.deleteMessage')}
        confirmLabel={t('requests.deleteAccount')}
        danger
        loading={processDeletion.isPending}
        onDismiss={() => setDialog(null)}
        onConfirm={() => {
          setError(null);
          processDeletion.mutate(item.id, {
            onSuccess: () => {
              setDialog(null);
              setNotice(t('requests.deleted'));
            },
            onError: fail,
          });
        }}
      />
      <ReasonDialog
        visible={dialog === 'reject'}
        title={t('requests.rejectTitle')}
        message={t('requests.rejectMessage')}
        confirmLabel={t('requests.reject')}
        loading={resolve.isPending}
        onDismiss={() => setDialog(null)}
        onConfirm={(reason) => resolveWith('rejected', reason)}
      />
      <ConfirmDialog
        visible={exported !== null}
        title={t('requests.exportReady')}
        message={t('requests.exportSize', {
          kb: Math.max(1, Math.round((exported?.length ?? 0) / 1024)),
        })}
        confirmLabel={t('requests.copy')}
        onDismiss={() => setExported(null)}
        onConfirm={() => {
          if (exported) void Clipboard.setStringAsync(exported);
          setNotice(t('requests.copied'));
          setExported(null);
        }}
      >
        <Button
          label={t('requests.share')}
          variant="secondary"
          onPress={() => {
            if (exported) void Share.share({ message: exported });
          }}
        />
      </ConfirmDialog>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm },
  items: { gap: spacing.sm, paddingBottom: spacing.lg },
});
