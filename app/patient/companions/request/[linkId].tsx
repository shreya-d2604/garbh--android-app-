import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Card, InfoBanner, LoadingState, QueryBoundary, Screen } from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import { ClosedState } from '@/features/companion/components/ClosedState';
import { ConfirmDialog } from '@/features/companion/components/ConfirmDialog';
import { PermissionToggles } from '@/features/companion/components/PermissionToggles';
import { useDecideLink, useMyPatient, usePatientLinks } from '@/features/companion/hooks';
import { DEFAULT_PERMISSIONS, type PermissionState } from '@/features/companion/permissions';
import type { PatientLinkView } from '@/features/companion/types';

function RequestForm({ link }: { link: PatientLinkView }) {
  const { t } = useTranslation('companion');
  const { t: tc } = useTranslation();
  const router = useRouter();
  const decide = useDecideLink();
  const [perms, setPerms] = useState<PermissionState>(DEFAULT_PERMISSIONS);
  const [declining, setDeclining] = useState(false);

  const leave = () => router.replace('/patient/companions');
  const name = link.companion_name ?? t('my.unnamed');

  if (decide.isSuccess) return <LoadingState />;

  return (
    <>
      <Card variant="soft">
        <InfoBanner
          icon="account-heart-outline"
          message={t('request.intro', {
            name,
            relation: t(`relations.${link.relation}`).toLowerCase(),
          })}
        />
      </Card>
      <Card>
        <PermissionToggles value={perms} onChange={setPerms} disabled={decide.isPending} />
      </Card>
      {decide.error ? <InfoBanner tone="danger" message={tc(rpcErrorKey(decide.error))} /> : null}
      <Button
        label={t('request.approve')}
        loading={decide.isPending && !declining}
        onPress={() =>
          decide.mutate(
            { linkId: link.id, approve: true, permissions: perms },
            { onSuccess: leave },
          )
        }
        accessibilityLabel={t('request.approve')}
      />
      <Button
        label={t('request.decline')}
        variant="secondary"
        disabled={decide.isPending}
        onPress={() => setDeclining(true)}
        accessibilityLabel={t('request.decline')}
      />
      <ConfirmDialog
        visible={declining}
        title={t('request.declineTitle')}
        message={t('request.declineMessage')}
        confirmLabel={t('request.declineConfirm')}
        cancelLabel={tc('actions.cancel')}
        loading={decide.isPending}
        onDismiss={() => setDeclining(false)}
        onConfirm={() =>
          decide.mutate(
            { linkId: link.id, approve: false, permissions: perms },
            { onSuccess: leave, onSettled: () => setDeclining(false) },
          )
        }
      />
    </>
  );
}

/** Approve (with permission toggles) or decline a pending companion request. */
export default function ReviewRequest() {
  const { linkId } = useLocalSearchParams<{ linkId: string }>();
  const me = useMyPatient();
  const links = usePatientLinks(me.data?.id);
  const link = links.data?.find((l) => l.id === linkId);

  return (
    <Screen edges={['bottom']}>
      <QueryBoundary
        query={{
          isPending: me.isPending || (me.data != null && links.isPending),
          isError: me.isError || links.isError,
          refetch: () => {
            void me.refetch();
            void links.refetch();
          },
        }}
      >
        {link?.status === 'pending' ? <RequestForm link={link} /> : <ClosedStateRequest />}
      </QueryBoundary>
    </Screen>
  );
}

function ClosedStateRequest() {
  const { t } = useTranslation('companion');
  return <ClosedState message={t('request.closed')} />;
}
