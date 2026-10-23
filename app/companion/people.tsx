import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  EmptyState,
  InfoBanner,
  ListItem,
  QueryBoundary,
  Screen,
  SectionHeader,
  StatusChip,
} from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import { ConfirmDialog } from '@/features/companion/components/ConfirmDialog';
import { useCompanionLinks, useEndLink } from '@/features/companion/hooks';
import { homeHref } from '@/features/companion/sections';
import {
  approvedLinks,
  resolveSelectedPatientId,
  useCompanionSelection,
} from '@/features/companion/store';
import type { CompanionLinkView } from '@/features/companion/types';

/** Patient switcher + "Leave" + follow someone else. */
export default function People() {
  const { t } = useTranslation('companion');
  const { t: tc } = useTranslation();
  const router = useRouter();
  const links = useCompanionLinks();
  const end = useEndLink();
  const selected = useCompanionSelection((s) => s.selectedPatientId);
  const select = useCompanionSelection((s) => s.select);
  const [leaving, setLeaving] = useState<CompanionLinkView | null>(null);

  const all = links.data ?? [];
  const approved = approvedLinks(all);
  const pending = all.filter((l) => l.status === 'pending');
  const current = resolveSelectedPatientId(all, selected);

  return (
    <Screen
      edges={['bottom']}
      title={t('people.title')}
      refreshing={links.isRefetching}
      onRefresh={() => void links.refetch()}
    >
      <QueryBoundary
        query={{
          isPending: links.isPending,
          isError: links.isError,
          refetch: () => void links.refetch(),
        }}
      >
        {approved.length === 0 && pending.length === 0 ? (
          <EmptyState
            icon="account-heart-outline"
            title={t('people.emptyTitle')}
            message={t('people.emptyMessage')}
            actionLabel={t('people.add')}
            onAction={() => router.push('/companion/join')}
          />
        ) : (
          <>
            {approved.length > 0 ? <SectionHeader title={t('people.following')} /> : null}
            {approved.map((link) => (
              <Card key={link.id}>
                <ListItem
                  icon="account-heart-outline"
                  title={link.patient_name ?? t('people.unnamed')}
                  description={t(`relations.${link.relation}`)}
                  right={
                    link.patient_id === current ? (
                      <StatusChip label={t('people.viewing')} tone="primary" />
                    ) : undefined
                  }
                  onPress={() => {
                    select(link.patient_id);
                    router.replace(homeHref(link.patient_id));
                  }}
                  accessibilityLabel={t('people.open', { name: link.patient_name ?? '' })}
                />
                <Button
                  label={t('people.leave')}
                  variant="text"
                  onPress={() => setLeaving(link)}
                  accessibilityLabel={t('people.leave')}
                />
              </Card>
            ))}

            {pending.length > 0 ? <SectionHeader title={t('people.pending')} /> : null}
            {pending.map((link) => (
              <Card
                key={link.id}
                title={t(`relations.${link.relation}`)}
                subtitle={t('waiting.sent', {
                  when: formatDistanceToNow(new Date(link.requested_at), { addSuffix: true }),
                })}
                right={<StatusChip label={t('people.waiting')} tone="warning" />}
              >
                <Button
                  label={t('waiting.cancel')}
                  variant="text"
                  onPress={() => setLeaving(link)}
                  accessibilityLabel={t('waiting.cancel')}
                />
              </Card>
            ))}

            <Button
              label={t('people.add')}
              variant="secondary"
              onPress={() => router.push('/companion/join')}
              accessibilityLabel={t('people.add')}
            />
          </>
        )}
        {end.error ? <InfoBanner tone="danger" message={tc(rpcErrorKey(end.error))} /> : null}
      </QueryBoundary>

      <ConfirmDialog
        visible={leaving != null}
        title={leaving?.status === 'pending' ? t('waiting.cancelTitle') : t('people.leaveTitle')}
        message={
          leaving?.status === 'pending'
            ? t('waiting.cancelMessage')
            : t('people.leaveMessage', { name: leaving?.patient_name ?? t('people.unnamed') })
        }
        confirmLabel={
          leaving?.status === 'pending' ? t('waiting.cancelConfirm') : t('people.leaveConfirm')
        }
        cancelLabel={tc('actions.cancel')}
        loading={end.isPending}
        onDismiss={() => setLeaving(null)}
        onConfirm={() => {
          if (leaving) end.mutate(leaving.id, { onSettled: () => setLeaving(null) });
        }}
      />
    </Screen>
  );
}
