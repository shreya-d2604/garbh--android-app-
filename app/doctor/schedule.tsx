import { useTranslation } from 'react-i18next';

import { Card, ErrorState, LoadingState, Screen } from '@/components';
import { AvailabilityCard } from '@/features/doctor/components/schedule/AvailabilityCard';
import { TimeOffCard } from '@/features/doctor/components/schedule/TimeOffCard';
import { ErrorBanner } from '@/features/doctor/components/ErrorBanner';
import { SwitchRow } from '@/features/doctor/components/SwitchRow';
import { useAcceptingNewPatients, useScheduleActions } from '@/features/doctor/hooks';

/** My schedule (PLAN.md §7.4 #9): accepting new patients, weekly hours, time off with clashes. */
export default function ScheduleScreen() {
  const { t } = useTranslation('doctor');
  const accepting = useAcceptingNewPatients();
  const { setAccepting } = useScheduleActions();

  return (
    <Screen edges={[]}>
      <Card title={t('schedule.acceptingTitle')}>
        {accepting.isPending ? (
          <LoadingState />
        ) : accepting.isError ? (
          <ErrorState onRetry={() => void accepting.refetch()} />
        ) : (
          <SwitchRow
            label={t('schedule.accepting')}
            hint={t('schedule.acceptingHint')}
            value={setAccepting.isPending ? (setAccepting.variables ?? false) : accepting.data}
            disabled={setAccepting.isPending}
            onChange={(v) => setAccepting.mutate(v)}
          />
        )}
        <ErrorBanner error={setAccepting.error} />
      </Card>
      <AvailabilityCard />
      <TimeOffCard />
    </Screen>
  );
}
