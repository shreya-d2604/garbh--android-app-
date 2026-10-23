import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Card, InfoBanner } from '@/components';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { KeyValue } from '../components/KeyValue';
import { PregnancyLinks } from '../components/PregnancyLinks';
import { QueryBoundary } from '../components/QueryBoundary';
import { adminErrorKey } from '../errors';
import { formatWhen } from '../format';
import { useConsultation, useUpdateConsultation } from '../hooks';

/** A consultation whose advice was never published. The doctor should publish it; the admin can too. */
export function ConsultationFix({ id }: { id: string }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const query = useConsultation(id);
  const update = useUpdateConsultation();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = () => {
    setError(null);
    update.mutate(
      { id, values: { published_at: new Date().toISOString() } },
      {
        onSuccess: () => router.back(),
        onError: (e) => {
          setError(adminErrorKey(e));
          setConfirm(false);
        },
      },
    );
  };

  return (
    <QueryBoundary
      query={query}
      isEmpty={(c) => c === null}
      empty={{
        title: t('dq.fix.gone'),
        message: t('dq.fix.goneHint'),
        icon: 'check-circle-outline',
      }}
    >
      {(c) =>
        c ? (
          <>
            {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
            <Card title={t('dq.fix.consultation')}>
              <KeyValue label={t('dq.fix.created')} value={formatWhen(c.created_at)} />
              <KeyValue
                label={t('dq.fix.advice')}
                value={c.advice?.trim() ? t('dq.fix.adviceWritten') : t('dq.fix.adviceMissing')}
              />
              <InfoBanner
                message={c.advice?.trim() ? t('dq.fix.publishHint') : t('dq.fix.noAdviceHint')}
              />
              {c.published_at ? (
                <InfoBanner
                  tone="success"
                  icon="check-circle-outline"
                  message={t('dq.fix.alreadyPublished')}
                />
              ) : (
                <Button
                  label={t('dq.fix.publish')}
                  disabled={!c.advice?.trim()}
                  onPress={() => setConfirm(true)}
                />
              )}
            </Card>
            <PregnancyLinks pregnancyId={c.pregnancy_id} />
            <ConfirmDialog
              visible={confirm}
              title={t('dq.fix.publishTitle')}
              message={t('dq.fix.publishMessage')}
              confirmLabel={t('dq.fix.publish')}
              loading={update.isPending}
              onDismiss={() => setConfirm(false)}
              onConfirm={publish}
            />
          </>
        ) : null
      }
    </QueryBoundary>
  );
}
