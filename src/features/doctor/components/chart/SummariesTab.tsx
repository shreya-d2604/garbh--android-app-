import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Card, EmptyState, InfoBanner, ListItem, StatusChip, type Tone } from '@/components';

import { documentFromRow, functionErrorKey } from '../../ai-review';
import { useSummaryFunction, usePregnancySummaries } from '../../hooks';
import { QueryBoundary } from '../QueryBoundary';

const TONE: Record<string, Tone> = {
  generating: 'info',
  draft: 'warning',
  approved: 'info',
  published: 'success',
  rejected: 'neutral',
  failed: 'danger',
};

export function SummariesTab({ pregnancyId }: { pregnancyId: string }) {
  const { t } = useTranslation('doctor');
  const router = useRouter();
  const summaries = usePregnancySummaries(pregnancyId);
  const run = useSummaryFunction(pregnancyId);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; key: string } | null>(null);

  const generate = () => {
    setMessage(null);
    run.mutate(
      { name: 'summarize-pregnancy', body: { pregnancy_id: pregnancyId } },
      {
        onSuccess: (res) =>
          setMessage(res.ok ? { tone: 'success', key: 'ai.generated' } : { tone: 'danger', key: functionErrorKey(res.code) }),
      },
    );
  };

  return (
    <>
      <Button label={t('summaries.generate')} variant="secondary" loading={run.isPending} onPress={generate} />
      {message ? <InfoBanner tone={message.tone} message={t(message.key)} /> : null}
      <QueryBoundary
        query={summaries}
        isEmpty={(s) => s.length === 0}
        empty={<EmptyState icon="creation-outline" title={t('summaries.emptyTitle')} message={t('summaries.emptyMessage')} />}
      >
        {(rows) => (
          <Card>
            {rows.map((s) => (
              <ListItem
                key={s.id}
                icon="creation-outline"
                title={documentFromRow(s)?.summary.headline || t(`inbox.source.${s.source_type}`)}
                description={[t(`inbox.source.${s.source_type}`), format(new Date(s.created_at), 'd MMM yyyy')].join(' · ')}
                right={<StatusChip label={t(`inbox.status.${s.status}`)} tone={TONE[s.status] ?? 'neutral'} />}
                onPress={() => router.push(`/doctor/ai-inbox/${s.id}`)}
              />
            ))}
          </Card>
        )}
      </QueryBoundary>
    </>
  );
}
