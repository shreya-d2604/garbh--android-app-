import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  APPOINTMENT_STATUS_TONE,
  Button,
  Card,
  InfoBanner,
  QueryBoundary,
  StatusChip,
} from '@/components';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { KeyValue } from '../components/KeyValue';
import { PregnancyLinks } from '../components/PregnancyLinks';
import { adminErrorKey } from '../errors';
import { formatWhen } from '../format';
import { useAppointment, useCloseAppointment } from '../hooks';

type Outcome = 'no_show' | 'completed' | 'cancelled';

/** An appointment from an earlier day that is still booked: close it. */
export function PastBookedFix({ id }: { id: string }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const query = useAppointment(id);
  const close = useCloseAppointment();
  const [pending, setPending] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (status: Outcome) => {
    setError(null);
    close.mutate(
      { id, status },
      {
        onSuccess: () => router.back(),
        onError: (e) => {
          setError(adminErrorKey(e));
          setPending(null);
        },
      },
    );
  };

  return (
    <QueryBoundary
      query={query}
      isEmpty={(a) => a === null}
      empty={{
        title: t('dq.fix.gone'),
        message: t('dq.fix.goneHint'),
        icon: 'check-circle-outline',
      }}
    >
      {(appt) =>
        appt ? (
          <>
            {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
            <Card
              title={t('dq.fix.appointment')}
              right={
                <StatusChip
                  label={t(`common:status.${appt.status}`)}
                  tone={APPOINTMENT_STATUS_TONE[appt.status]}
                />
              }
            >
              <KeyValue label={t('dq.fix.when')} value={formatWhen(appt.starts_at)} />
              <KeyValue label={t('dq.fix.reason')} value={appt.reason} />
              <InfoBanner message={t('dq.fix.pastBookedHint')} />
              <Button label={t('dq.fix.markNoShow')} onPress={() => setPending('no_show')} />
              <Button
                label={t('dq.fix.markCompleted')}
                variant="secondary"
                onPress={() => setPending('completed')}
              />
              <Button
                label={t('dq.fix.cancelAppointment')}
                variant="danger"
                onPress={() => setPending('cancelled')}
              />
            </Card>
            <PregnancyLinks pregnancyId={appt.pregnancy_id} />
            <ConfirmDialog
              visible={pending !== null}
              title={t('dq.fix.confirmTitle')}
              message={pending ? t(`dq.fix.confirm.${pending}`) : undefined}
              confirmLabel={t('dq.fix.confirmButton')}
              danger={pending === 'cancelled'}
              loading={close.isPending}
              onDismiss={() => setPending(null)}
              onConfirm={() => pending && apply(pending)}
            />
          </>
        ) : null
      }
    </QueryBoundary>
  );
}
