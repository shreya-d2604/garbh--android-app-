import { useTranslation } from 'react-i18next';

import { Card, InfoBanner, QueryBoundary } from '@/components';

import { KeyValue } from '../components/KeyValue';
import { PregnancyLinks } from '../components/PregnancyLinks';
import { formatWhen } from '../format';
import { useAiSummary } from '../hooks';

/** An AI draft waiting for review for over a day: make sure a doctor on the care team can review it. */
export function AiDraftFix({ id }: { id: string }) {
  const { t } = useTranslation('admin');
  const query = useAiSummary(id);
  return (
    <QueryBoundary
      query={query}
      isEmpty={(s) => s === null}
      empty={{
        title: t('dq.fix.gone'),
        message: t('dq.fix.goneHint'),
        icon: 'check-circle-outline',
      }}
    >
      {(s) =>
        s ? (
          <>
            <Card title={t('dq.fix.aiDraft')}>
              <KeyValue label={t('dq.fix.source')} value={t(`dq.fix.sources.${s.source_type}`)} />
              <KeyValue label={t('dq.fix.generated')} value={formatWhen(s.generated_at)} />
              <KeyValue label={t('dq.fix.status')} value={s.status} />
              <InfoBanner message={t('dq.fix.aiHint')} />
            </Card>
            <PregnancyLinks pregnancyId={s.pregnancy_id} />
          </>
        ) : null
      }
    </QueryBoundary>
  );
}
