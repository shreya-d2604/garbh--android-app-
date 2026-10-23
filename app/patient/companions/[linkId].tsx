import { formatDate } from 'date-fns';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Card, ConfirmDialog, InfoBanner, QueryBoundary, Screen } from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import { ClosedState } from '@/features/companion/components/ClosedState';
import { PermissionToggles } from '@/features/companion/components/PermissionToggles';
import {
  useDecideLink,
  useEndLink,
  useMyPatient,
  usePatientLinks,
} from '@/features/companion/hooks';
import {
  permissionsFromLink,
  samePermissions,
  type PermissionState,
} from '@/features/companion/permissions';
import type { PatientLinkView } from '@/features/companion/types';

function CompanionDetail({ link }: { link: PatientLinkView }) {
  const { t } = useTranslation('companion');
  const { t: tc } = useTranslation();
  const router = useRouter();
  const decide = useDecideLink();
  const end = useEndLink();
  const saved = permissionsFromLink(link);
  const [edited, setEdited] = useState<PermissionState | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const value = edited ?? saved;
  const dirty = edited != null && !samePermissions(edited, saved);
  const name = link.companion_name ?? t('my.unnamed');
  const error = decide.error ?? end.error;

  return (
    <>
      <Card
        title={name}
        subtitle={[
          t(`relations.${link.relation}`),
          link.decided_at
            ? t('detail.since', { date: formatDate(new Date(link.decided_at), 'd MMM yyyy') })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        <PermissionToggles
          value={value}
          onChange={(next) => {
            setEdited(next);
            setJustSaved(false);
          }}
          disabled={decide.isPending || end.isPending}
        />
      </Card>
      {justSaved && !dirty ? (
        <InfoBanner tone="success" icon="check-circle-outline" message={t('detail.saved')} />
      ) : null}
      {error ? <InfoBanner tone="danger" message={tc(rpcErrorKey(error))} /> : null}
      <Button
        label={t('detail.save')}
        disabled={!dirty || end.isPending}
        loading={decide.isPending}
        onPress={() =>
          decide.mutate(
            { linkId: link.id, approve: true, permissions: value },
            {
              onSuccess: () => {
                setEdited(null);
                setJustSaved(true);
              },
            },
          )
        }
        accessibilityLabel={t('detail.save')}
      />
      <Button
        label={t('detail.stop')}
        variant="danger"
        disabled={decide.isPending}
        onPress={() => setConfirmStop(true)}
        accessibilityLabel={t('detail.stop')}
      />
      <ConfirmDialog
        danger
        visible={confirmStop}
        title={t('detail.stopTitle')}
        message={t('detail.stopMessage', { name })}
        confirmLabel={t('detail.stopConfirm')}
        cancelLabel={tc('actions.cancel')}
        loading={end.isPending}
        onDismiss={() => setConfirmStop(false)}
        onConfirm={() =>
          end.mutate(link.id, {
            onSuccess: () => router.replace('/patient/companions'),
            onSettled: () => setConfirmStop(false),
          })
        }
      />
    </>
  );
}

/** One approved companion: edit what they can see, or stop sharing (with confirmation). */
export default function CompanionDetailScreen() {
  const { t } = useTranslation('companion');
  const { linkId } = useLocalSearchParams<{ linkId: string }>();
  const me = useMyPatient();
  const links = usePatientLinks(me.data?.id);
  const link = links.data?.find((l) => l.id === linkId);

  if (link?.status === 'pending')
    return <Redirect href={`/patient/companions/request/${link.id}`} />;

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
        {link?.status === 'approved' ? (
          <CompanionDetail link={link} />
        ) : (
          <ClosedState message={t('detail.closed')} />
        )}
      </QueryBoundary>
    </Screen>
  );
}
