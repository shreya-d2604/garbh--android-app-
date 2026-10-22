import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card, InfoBanner, ListItem, Screen, SectionHeader } from '@/components';
import { companionCanView } from '@/domain/permissions';
import { GaCard } from '@/features/companion/components/GaCard';
import { LatestSummaryCard } from '@/features/companion/components/LatestSummaryCard';
import { NextAppointmentCard } from '@/features/companion/components/NextAppointmentCard';
import { useCompanionLinks } from '@/features/companion/hooks';
import { sectionHref, visibleSections } from '@/features/companion/sections';
import { approvedLinks } from '@/features/companion/store';
import { useQueryClient } from '@tanstack/react-query';

/** Home of one followed patient: highlights plus the list of sections this link may open. */
export default function CompanionPatientHome() {
  const { t } = useTranslation('companion');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const links = useCompanionLinks();
  const link = links.data?.find((l) => l.patient_id === patientId && l.status === 'approved');
  const sections = visibleSections(link);
  const several = approvedLinks(links.data ?? []).length > 1;

  return (
    <Screen
      edges={['bottom']}
      refreshing={links.isRefetching}
      onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: ['companion'] });
      }}
    >
      <Card>
        <ListItem
          icon="account-heart-outline"
          title={link?.patient_name ?? t('people.unnamed')}
          description={link ? t(`relations.${link.relation}`) : undefined}
          onPress={() => router.push('/companion/people')}
          accessibilityLabel={several ? t('home.switch') : t('home.manage')}
        />
      </Card>

      {companionCanView(link, 'journey') ? (
        <GaCard
          patientId={patientId}
          onPress={() => router.push(sectionHref(patientId, 'journey'))}
        />
      ) : null}
      {companionCanView(link, 'appointments') ? (
        <NextAppointmentCard
          patientId={patientId}
          onPress={() => router.push(sectionHref(patientId, 'appointments'))}
        />
      ) : null}
      {companionCanView(link, 'summaries') ? (
        <LatestSummaryCard
          patientId={patientId}
          onPress={() => router.push(sectionHref(patientId, 'summaries'))}
        />
      ) : null}

      {sections.length > 0 ? (
        <>
          <SectionHeader title={t('home.sections')} />
          <Card>
            {sections.map((s) => (
              <ListItem
                key={s.key}
                icon={s.icon}
                title={t(`sections.${s.key}`)}
                onPress={() => router.push(sectionHref(patientId, s.key))}
              />
            ))}
          </Card>
        </>
      ) : (
        <InfoBanner message={t('home.nothingShared')} />
      )}
    </Screen>
  );
}
