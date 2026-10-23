import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card, ErrorState, InfoBanner, LoadingState, Screen } from '@/components';
import { CodeEntryForm } from '@/features/companion/components/CodeEntryForm';
import { WaitingView } from '@/features/companion/components/WaitingView';
import { useCompanionLinks } from '@/features/companion/hooks';
import { homeHref } from '@/features/companion/sections';
import { resolveGateway, useCompanionSelection } from '@/features/companion/store';

/**
 * Entry point of the companion area (also the target of companion_approved/revoked
 * notifications): approved -> the patient's home, pending -> waiting, otherwise code entry.
 */
export default function CompanionGateway() {
  const { t } = useTranslation('companion');
  const links = useCompanionLinks();
  const selected = useCompanionSelection((s) => s.selectedPatientId);

  if (links.isPending) return <LoadingState />;
  if (links.isError) return <ErrorState onRetry={() => void links.refetch()} />;

  const gateway = resolveGateway(links.data, selected);
  if (gateway.kind === 'approved') return <Redirect href={homeHref(gateway.patientId)} />;
  if (gateway.kind === 'waiting') {
    return <WaitingView pending={links.data.filter((l) => l.status === 'pending')} />;
  }

  return (
    <Screen
      edges={['bottom']}
      title={t('join.title')}
      subtitle={t('join.subtitle')}
      refreshing={links.isRefetching}
      onRefresh={() => void links.refetch()}
    >
      {gateway.notice ? (
        <InfoBanner
          tone="warning"
          icon="information-outline"
          message={t(`join.notice.${gateway.notice}`)}
        />
      ) : null}
      <Card>
        <CodeEntryForm />
      </Card>
    </Screen>
  );
}
