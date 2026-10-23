import { useRouter } from 'expo-router';
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
import { useMyPatient, usePatientLinks } from '@/features/companion/hooks';
import { enabledPermissions, permissionsFromLink } from '@/features/companion/permissions';

export default function MyCompanions() {
  const { t } = useTranslation('companion');
  const router = useRouter();
  const me = useMyPatient();
  const links = usePatientLinks(me.data?.id);

  const pending = (links.data ?? []).filter((l) => l.status === 'pending');
  const approved = (links.data ?? []).filter((l) => l.status === 'approved');
  const loadingLinks = me.data?.verified === true && links.isPending;

  const refetch = () => {
    void me.refetch();
    void links.refetch();
  };

  return (
    <Screen
      edges={['bottom']}
      refreshing={me.isRefetching || links.isRefetching}
      onRefresh={refetch}
    >
      <QueryBoundary
        query={{
          isPending: me.isPending || loadingLinks,
          isError: me.isError || links.isError,
          refetch: refetch,
        }}
      >
        {!me.data?.verified ? (
          <Card variant="soft">
            <EmptyState
              icon="shield-lock-outline"
              title={t('my.unverifiedTitle')}
              message={t('my.unverifiedMessage')}
            />
          </Card>
        ) : (
          <>
            <InfoBanner message={t('my.intro')} icon="account-group-outline" />
            <Button
              label={t('my.invite')}
              onPress={() => router.push('/patient/companions/invite')}
              accessibilityLabel={t('my.invite')}
            />

            {pending.length > 0 ? <SectionHeader title={t('my.requests')} /> : null}
            {pending.map((l) => (
              <Card key={l.id} variant="soft">
                <ListItem
                  icon="account-clock-outline"
                  title={l.companion_name ?? t('my.unnamed')}
                  description={t(`relations.${l.relation}`)}
                  right={<StatusChip label={t('my.newChip')} tone="warning" />}
                  onPress={() => router.push(`/patient/companions/request/${l.id}`)}
                />
              </Card>
            ))}

            {approved.length > 0 ? <SectionHeader title={t('my.companions')} /> : null}
            {approved.map((l) => {
              const list = enabledPermissions(permissionsFromLink(l))
                .filter((k) => k !== 'notifications')
                .map((k) => t(`perms.${k}.label`))
                .join(', ');
              return (
                <Card key={l.id}>
                  <ListItem
                    icon="account-heart-outline"
                    title={l.companion_name ?? t('my.unnamed')}
                    description={`${t(`relations.${l.relation}`)} · ${
                      list ? t('my.canSee', { list }) : t('my.canSeeNothing')
                    }`}
                    onPress={() => router.push(`/patient/companions/${l.id}`)}
                  />
                </Card>
              );
            })}

            {pending.length === 0 && approved.length === 0 ? (
              <EmptyState
                icon="account-group-outline"
                title={t('my.emptyTitle')}
                message={t('my.emptyMessage')}
              />
            ) : null}
          </>
        )}
      </QueryBoundary>
    </Screen>
  );
}
