import { useTranslation } from 'react-i18next';

import { EmptyState, QueryBoundary, Screen, SectionHeader } from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import { InlineError, InlineLoading } from '@/features/patient/components/Inline';
import { JourneyCard } from '@/features/patient/components/JourneyCard';
import { MilestonePath } from '@/features/patient/components/MilestonePath';
import { PatientGate, type ReadyContext } from '@/features/patient/components/PatientGate';
import { TrimesterTimeline } from '@/features/patient/components/TrimesterTimeline';
import { WeekSwiper } from '@/features/patient/components/WeekSwiper';
import { WhatsNext } from '@/features/patient/components/WhatsNext';
import { useMilestonePath, usePullToRefresh, useWeekContent } from '@/features/patient/hooks';
import { journeySnapshot, pickWeekContent, whatsNext } from '@/features/patient/journey';

function ThisWeek({ weeks }: { weeks: number }) {
  const { t } = useTranslation('patient');
  const content = useWeekContent();
  if (content.isError) return <InlineError onRetry={() => void content.refetch()} />;
  if (!content.data) return <InlineLoading />;
  if (content.data.length === 0) {
    return <EmptyState icon="flower-tulip-outline" title={t('journey.noWeekContent')} />;
  }
  const picked = pickWeekContent(content.data, weeks);
  const initialIndex = Math.max(
    0,
    content.data.findIndex((r) => r.week === picked?.week),
  );
  return <WeekSwiper rows={content.data} initialIndex={initialIndex} />;
}

function JourneyContent({ ctx }: { ctx: ReadyContext }) {
  const { t } = useTranslation('patient');
  const weeksContent = useWeekContent();
  const snapshot = journeySnapshot(ctx.edd, todayISO());
  const path = useMilestonePath(ctx.edd, ctx.patient.rh_negative);
  const babySize =
    pickWeekContent(weeksContent.data ?? [], snapshot.ga.weeks)?.baby_size_label ?? null;
  return (
    <>
      <JourneyCard snapshot={snapshot} edd={ctx.edd} babySize={babySize} />
      <TrimesterTimeline ga={snapshot.ga} />

      <SectionHeader title={t('journey.thisWeek')} />
      <ThisWeek weeks={snapshot.ga.weeks} />

      <QueryBoundary
        query={path}
        isEmpty={(nodes) => nodes.length <= 1}
        empty={<EmptyState icon="map-marker-path" title={t('journey.noPath')} />}
      >
        {(nodes) => (
          <>
            <SectionHeader title={t('journey.whatsNext')} />
            <WhatsNext nodes={whatsNext(nodes, 3)} />
            <SectionHeader title={t('journey.yourJourney')} />
            <MilestonePath nodes={nodes} weeks={snapshot.ga.weeks} days={snapshot.ga.days} />
          </>
        )}
      </QueryBoundary>
    </>
  );
}

// Journey (PLAN.md §7.2 #2): trimester timeline, week-by-week, what's next, milestone path.
export default function JourneyScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>{(ctx) => <JourneyContent ctx={ctx} />}</PatientGate>
    </Screen>
  );
}
