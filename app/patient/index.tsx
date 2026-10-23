import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { InfoBanner, Screen } from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import { firstName } from '@/features/patient/dates';
import { usePullToRefresh, useWeekContent } from '@/features/patient/hooks';
import { journeySnapshot, pickWeekContent } from '@/features/patient/journey';
import { JourneyCard } from '@/features/patient/components/JourneyCard';
import {
  AlertsSection,
  LatestSummarySection,
  NextAppointmentSection,
  TodaysMedicinesSection,
} from '@/features/patient/components/HomeSections';
import { PatientGate, type ReadyContext } from '@/features/patient/components/PatientGate';
import { useSession } from '@/lib/session';

function HomeContent({ ctx }: { ctx: ReadyContext }) {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const weeks = useWeekContent();
  const snapshot = journeySnapshot(ctx.edd, todayISO());
  const babySize = pickWeekContent(weeks.data ?? [], snapshot.ga.weeks)?.baby_size_label ?? null;
  return (
    <>
      {ctx.patient.is_verified ? null : (
        <InfoBanner
          icon="card-account-details-outline"
          message={t('common:onboarding.verifyBanner')}
        />
      )}
      <JourneyCard
        snapshot={snapshot}
        edd={ctx.edd}
        babySize={babySize}
        onPress={() => router.push('/patient/journey')}
      />
      <AlertsSection />
      <NextAppointmentSection />
      <LatestSummarySection />
      <TodaysMedicinesSection />
    </>
  );
}

// Patient home (PLAN.md §7.2 #1).
export default function PatientHome() {
  const { t } = useTranslation('patient');
  const name = useSession((s) => s.profile?.full_name);
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen
      title={t('common:shell.welcome', { name: firstName(name) })}
      edges={[]}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      <PatientGate>{(ctx) => <HomeContent ctx={ctx} />}</PatientGate>
    </Screen>
  );
}
