import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChoiceChips, EmptyState, ErrorState, LoadingState, Screen } from '@/components';
import { CareTeamPanel } from '@/features/doctor/components/chart/CareTeamPanel';
import { ChartHeader } from '@/features/doctor/components/chart/ChartHeader';
import { PrescriptionsTab } from '@/features/doctor/components/chart/PrescriptionsTab';
import { ReportsTab } from '@/features/doctor/components/chart/ReportsTab';
import { SummariesTab } from '@/features/doctor/components/chart/SummariesTab';
import { TimelineTab } from '@/features/doctor/components/chart/TimelineTab';
import { VisitPlanTab } from '@/features/doctor/components/chart/VisitPlanTab';
import { VitalsTab } from '@/features/doctor/components/chart/VitalsTab';
import { useCareTeam, useChart, useDoctorDirectory, useMyId } from '@/features/doctor/hooks';
import { useSecureScreen } from '@/features/doctor/use-secure-screen';

const TABS = ['timeline', 'vitals', 'reports', 'prescriptions', 'plan', 'summaries'] as const;
type Tab = (typeof TABS)[number];

/** Patient chart for one pregnancy (PLAN.md §7.4 #3). Blocks screenshots; opening it is audit-logged. */
export default function PatientChart() {
  const { pregnancyId } = useLocalSearchParams<{ pregnancyId: string }>();
  const { t } = useTranslation('doctor');
  const router = useRouter();
  useSecureScreen('doctor-chart');
  const me = useMyId();
  const chart = useChart(pregnancyId);
  const directory = useDoctorDirectory();
  const team = useCareTeam(pregnancyId, t('team.unknownDoctor'));
  const [tab, setTab] = useState<Tab>('timeline');

  if (chart.isPending)
    return (
      <Screen edges={['bottom']}>
        <LoadingState />
      </Screen>
    );
  if (chart.isError)
    return (
      <Screen edges={['bottom']}>
        <ErrorState onRetry={() => void chart.refetch()} />
      </Screen>
    );
  if (!chart.data) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon="account-off-outline"
          title={t('chart.notFoundTitle')}
          message={t('chart.notFoundMessage')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      edges={['bottom']}
      refreshing={chart.isRefetching}
      onRefresh={() => void chart.refetch()}
    >
      <ChartHeader
        chart={chart.data}
        onManage={() => router.push(`/doctor/patient/${pregnancyId}/manage`)}
      />
      {team ? (
        <CareTeamPanel
          pregnancyId={pregnancyId}
          members={team}
          directory={directory.data ?? []}
          me={me}
        />
      ) : null}
      <ChoiceChips
        scroll
        allowClear={false}
        value={tab}
        onChange={(v) => v !== '' && setTab(v)}
        options={TABS.map((v) => ({ value: v, label: t(`chart.tabs.${v}`) }))}
      />
      {tab === 'timeline' ? <TimelineTab pregnancyId={pregnancyId} /> : null}
      {tab === 'vitals' ? <VitalsTab pregnancyId={pregnancyId} /> : null}
      {tab === 'reports' ? <ReportsTab pregnancyId={pregnancyId} /> : null}
      {tab === 'prescriptions' ? <PrescriptionsTab pregnancyId={pregnancyId} /> : null}
      {tab === 'plan' ? (
        <VisitPlanTab pregnancyId={pregnancyId} edd={chart.data.pregnancy.edd_final} />
      ) : null}
      {tab === 'summaries' ? <SummariesTab pregnancyId={pregnancyId} /> : null}
    </Screen>
  );
}
