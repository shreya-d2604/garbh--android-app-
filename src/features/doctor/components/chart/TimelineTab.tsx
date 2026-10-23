import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Card,
  combineQueries,
  EmptyState,
  ListItem,
  QueryBoundary,
  StatusChip,
} from '@/components';

import { buildTimeline, type TimelineEntry } from '../../chart';
import { usePregnancyConsultations, usePregnancyReports, usePregnancyVisits } from '../../hooks';

const ICON = {
  visit: 'calendar-check-outline',
  consultation: 'stethoscope',
  report: 'file-document-outline',
} as const;

export function TimelineTab({ pregnancyId }: { pregnancyId: string }) {
  const { t } = useTranslation('doctor');
  const router = useRouter();
  const visits = usePregnancyVisits(pregnancyId);
  const consultations = usePregnancyConsultations(pregnancyId);
  const reports = usePregnancyReports(pregnancyId);

  const entries = useMemo(
    () => buildTimeline(visits.data ?? [], consultations.data ?? [], reports.data ?? []),
    [visits.data, consultations.data, reports.data],
  );

  const open = (e: TimelineEntry) => {
    if (e.kind === 'report') router.push(`/doctor/patient/${pregnancyId}/report/${e.id}`);
    else if (e.kind === 'consultation' && e.appointmentId)
      router.push(`/doctor/consult/${e.appointmentId}`);
  };

  const describe = (e: TimelineEntry) => {
    const date = format(new Date(e.at.length === 10 ? `${e.at}T00:00:00` : e.at), 'd MMM yyyy');
    return e.kind === 'consultation' && e.title ? `${date} · ${e.title}` : date;
  };

  const label = (e: TimelineEntry) =>
    e.kind === 'consultation'
      ? t('timeline.consultation')
      : e.kind === 'report'
        ? e.title || t(`report.type.${e.status}`)
        : e.title;

  return (
    <QueryBoundary
      query={{ ...combineQueries(visits, consultations, reports), data: entries }}
      isEmpty={(data) => data.length === 0}
      empty={
        <EmptyState
          icon="timeline-outline"
          title={t('timeline.emptyTitle')}
          message={t('timeline.emptyMessage')}
        />
      }
    >
      {(data) => (
        <Card>
          {data.map((e) => (
            <ListItem
              key={`${e.kind}-${e.id}`}
              icon={ICON[e.kind]}
              title={label(e)}
              description={describe(e)}
              onPress={
                e.kind === 'report' || (e.kind === 'consultation' && e.appointmentId)
                  ? () => open(e)
                  : undefined
              }
              right={
                e.kind === 'consultation' ? (
                  <StatusChip
                    label={t(e.published ? 'timeline.published' : 'timeline.draft')}
                    tone={e.published ? 'success' : 'warning'}
                  />
                ) : e.kind === 'visit' ? (
                  <StatusChip
                    label={t(`visit.state.${e.status}`)}
                    tone={e.status === 'completed' ? 'success' : 'info'}
                  />
                ) : undefined
              }
            />
          ))}
        </Card>
      )}
    </QueryBoundary>
  );
}
