import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, EmptyState, InfoBanner, QueryBoundary, Screen, SectionHeader } from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import { QueueCard } from '@/features/doctor/components/QueueCard';
import { useStartConsultation, useTodayQueue } from '@/features/doctor/hooks';
import { groupQueue, queueCounts, type QueueItem } from '@/features/doctor/queue';

/** Today: the live queue Booked -> Checked in -> In consultation -> Done (PLAN.md §7.4 #1). */
export default function TodayScreen() {
  const { t } = useTranslation('doctor');
  const router = useRouter();
  const queue = useTodayQueue();
  const start = useStartConsultation();
  const [startingId, setStartingId] = useState<string | null>(null);

  const openChart = (i: QueueItem) => router.push(`/doctor/patient/${i.pregnancyId}`);
  const openConsult = (i: QueueItem) => router.push(`/doctor/consult/${i.id}`);
  const onStart = (i: QueueItem) => {
    setStartingId(i.id);
    start.mutate(i.id, {
      onSuccess: () => openConsult(i),
      onSettled: () => setStartingId(null),
    });
  };

  return (
    <Screen edges={[]} refreshing={queue.isRefetching} onRefresh={() => void queue.refetch()}>
      <QueryBoundary
        query={queue}
        isEmpty={(items) => items.length === 0}
        empty={
          <EmptyState
            icon="calendar-blank-outline"
            title={t('today.emptyTitle')}
            message={t('today.emptyMessage')}
          />
        }
      >
        {(items) => {
          const counts = queueCounts(items);
          return (
            <>
              <Card variant="soft" title={t('today.summary', { count: counts.total })}>
                <InfoBanner
                  tone="info"
                  icon="clock-outline"
                  message={t('today.summaryLine', {
                    waiting: counts.waiting,
                    inConsultation: counts.inConsultation,
                    done: counts.done,
                  })}
                />
              </Card>
              {start.isError ? (
                <InfoBanner
                  tone="danger"
                  message={t(rpcErrorKey(start.error as { message?: string }))}
                />
              ) : null}
              {groupQueue(items).map((group) => (
                <Section
                  key={group.key}
                  title={`${t(`today.group.${group.key}`)} (${group.items.length})`}
                >
                  {group.items.map((item) => (
                    <QueueCard
                      key={item.id}
                      item={item}
                      starting={startingId === item.id}
                      onStart={onStart}
                      onContinue={openConsult}
                      onOpenChart={openChart}
                    />
                  ))}
                </Section>
              ))}
            </>
          );
        }}
      </QueryBoundary>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SectionHeader title={title} />
      {children}
    </>
  );
}
