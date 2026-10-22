import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, EmptyState, ListItem, Screen, StatusChip, type Tone } from '@/components';
import { filterInbox, inboxCounts, type InboxTab } from '@/features/doctor/ai-review';
import { ChoiceChips } from '@/features/doctor/components/ChoiceChips';
import { QueryBoundary } from '@/features/doctor/components/QueryBoundary';
import { useInbox } from '@/features/doctor/hooks';

const TONE: Record<string, Tone> = {
  generating: 'info',
  draft: 'warning',
  approved: 'info',
  published: 'success',
  rejected: 'neutral',
  failed: 'danger',
};

/** AI review inbox (PLAN.md §7.4 #6): live list of summaries waiting for the doctor's review. */
export default function AiInbox() {
  const { t } = useTranslation('doctor');
  const router = useRouter();
  const inbox = useInbox();
  const [tab, setTab] = useState<InboxTab>('review');
  const counts = useMemo(() => inboxCounts(inbox.data ?? []), [inbox.data]);
  const rows = useMemo(() => filterInbox(inbox.data ?? [], tab), [inbox.data, tab]);

  return (
    <Screen edges={[]} refreshing={inbox.isRefetching} onRefresh={() => void inbox.refetch()}>
      <ChoiceChips
        scroll
        allowClear={false}
        value={tab}
        onChange={(v) => v !== '' && setTab(v)}
        options={(['review', 'done', 'issues'] as const).map((k) => ({ value: k, label: `${t(`inbox.tab.${k}`)} (${counts[k]})` }))}
      />
      <QueryBoundary
        query={{ ...inbox, data: rows }}
        isEmpty={(r) => r.length === 0}
        empty={<EmptyState icon="creation-outline" title={t(`inbox.empty.${tab}.title`)} message={t(`inbox.empty.${tab}.message`)} />}
      >
        {(data) => (
          <Card>
            {data.map((r) => (
              <ListItem
                key={r.id}
                icon="creation-outline"
                title={r.pregnancies?.patients?.full_name ?? t('inbox.unknownPatient')}
                description={[t(`inbox.source.${r.source_type}`), format(new Date(r.generated_at ?? r.created_at), 'd MMM, h:mm a')].join(' · ')}
                right={<StatusChip label={t(`inbox.status.${r.status}`)} tone={TONE[r.status] ?? 'neutral'} />}
                onPress={() => router.push(`/doctor/ai-inbox/${r.id}`)}
              />
            ))}
          </Card>
        )}
      </QueryBoundary>
    </Screen>
  );
}
