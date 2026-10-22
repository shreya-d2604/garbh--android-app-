import { useTranslation } from 'react-i18next';

import { Card, InfoBanner, ListItem, StatusChip } from '@/components';

import { PregnancyLinks } from '../components/PregnancyLinks';
import { QueryBoundary } from '../components/QueryBoundary';
import { formatDay } from '../format';
import { useReportValues } from '../hooks';

/** Lab values nobody has verified for 48 hours: the care-team doctor has to verify them. */
export function ReportValuesFix({ id }: { id: string }) {
  const { t } = useTranslation('admin');
  const query = useReportValues(id);
  return (
    <QueryBoundary
      query={query}
      isEmpty={(r) => r.report === null}
      empty={{
        title: t('dq.fix.gone'),
        message: t('dq.fix.goneHint'),
        icon: 'check-circle-outline',
      }}
    >
      {({ report, values }) =>
        report ? (
          <>
            <Card
              title={report.title ?? t('dq.fix.report')}
              subtitle={formatDay(report.report_date)}
            >
              <InfoBanner message={t('dq.fix.labHint')} />
              {values.map((v) => (
                <ListItem
                  key={v.id}
                  title={v.test_code ?? v.raw_name ?? '-'}
                  description={[v.value_num ?? v.value_text, v.unit]
                    .filter((x) => x !== null && x !== '')
                    .join(' ')}
                  right={
                    <StatusChip
                      label={v.verified ? t('dq.fix.verified') : t('dq.fix.unverified')}
                      tone={v.verified ? 'success' : 'warning'}
                    />
                  }
                />
              ))}
            </Card>
            <PregnancyLinks pregnancyId={report.pregnancy_id} />
          </>
        ) : null
      }
    </QueryBoundary>
  );
}
