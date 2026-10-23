import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Card, ConfirmDialog, EmptyState, InfoBanner, Screen } from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';

import { useEndLink } from '../hooks';
import type { CompanionLinkView } from '../types';

interface Props {
  pending: CompanionLinkView[];
}

/** "Waiting for approval". The parent query is refreshed live by the companion_links subscription. */
export function WaitingView({ pending }: Props) {
  const { t } = useTranslation('companion');
  const { t: tc } = useTranslation();
  const end = useEndLink();
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <Screen edges={['bottom']}>
      <Card variant="soft">
        <EmptyState icon="timer-sand" title={t('waiting.title')} message={t('waiting.message')} />
      </Card>

      {pending.map((link) => (
        <Card
          key={link.id}
          title={t(`relations.${link.relation}`)}
          subtitle={t('waiting.sent', {
            when: formatDistanceToNow(new Date(link.requested_at), { addSuffix: true }),
          })}
        >
          <Button
            label={t('waiting.cancel')}
            variant="secondary"
            onPress={() => setConfirm(link.id)}
            accessibilityLabel={t('waiting.cancel')}
          />
        </Card>
      ))}

      {end.error ? <InfoBanner tone="danger" message={tc(rpcErrorKey(end.error))} /> : null}

      <ConfirmDialog
        danger
        visible={confirm != null}
        title={t('waiting.cancelTitle')}
        message={t('waiting.cancelMessage')}
        confirmLabel={t('waiting.cancelConfirm')}
        cancelLabel={tc('actions.cancel')}
        loading={end.isPending}
        onDismiss={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) end.mutate(confirm, { onSettled: () => setConfirm(null) });
        }}
      />
    </Screen>
  );
}
