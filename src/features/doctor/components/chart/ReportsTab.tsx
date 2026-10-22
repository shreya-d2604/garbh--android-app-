import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, EmptyState, ListItem, StatusChip } from '@/components';

import { usePregnancyReports } from '../../hooks';
import { QueryBoundary } from '../QueryBoundary';

const TONE = {
  pending: 'neutral',
  processing: 'info',
  done: 'success',
  failed: 'danger',
  skipped: 'neutral',
} as const;

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

export function ReportsTab({ pregnancyId }: { pregnancyId: string }) {
  const { t } = useTranslation('doctor');
  const router = useRouter();
  const reports = usePregnancyReports(pregnancyId);
  const add = () => router.push(`/doctor/patient/${pregnancyId}/add-report`);

  return (
    <>
      <Button label={t('reports.add')} onPress={add} />
      <QueryBoundary
        query={reports}
        isEmpty={(r) => r.length === 0}
        empty={
          <EmptyState
            icon="file-document-outline"
            title={t('reports.emptyTitle')}
            message={t('reports.emptyMessage')}
          />
        }
      >
        {(rows) => (
          <Card>
            {rows.map((r) => (
              <ListItem
                key={r.id}
                icon="file-document-outline"
                title={r.title ?? t(`report.type.${r.type}`)}
                description={[
                  t(`report.type.${r.type}`),
                  r.report_date ? format(toDate(r.report_date), 'd MMM yyyy') : null,
                  t('reports.pages', { count: r.report_files.length }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={
                  r.verified_at ? (
                    <StatusChip label={t('reports.verified')} tone="success" />
                  ) : (
                    <StatusChip
                      label={t(`reports.extraction.${r.extraction_status}`)}
                      tone={TONE[r.extraction_status]}
                    />
                  )
                }
                onPress={() => router.push(`/doctor/patient/${pregnancyId}/report/${r.id}`)}
              />
            ))}
          </Card>
        )}
      </QueryBoundary>
    </>
  );
}
