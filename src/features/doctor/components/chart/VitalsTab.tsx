import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { combineQueries, EmptyState, QueryBoundary } from '@/components';

import { labSeries, vitalSeries } from '../../chart';
import { usePregnancyConsultations, usePregnancyLabResults } from '../../hooks';
import { TrendChart } from '../TrendChart';

/** Vitals trends (PLAN.md §7.4 #3): weight, BP, fundal height, fetal heart rate, and verified Hb. */
export function VitalsTab({ pregnancyId }: { pregnancyId: string }) {
  const { t } = useTranslation('doctor');
  const consultations = usePregnancyConsultations(pregnancyId);
  const labs = usePregnancyLabResults(pregnancyId);
  const series = useMemo(() => vitalSeries(consultations.data ?? []), [consultations.data]);
  const hb = useMemo(() => labSeries(labs.data ?? [], 'HB'), [labs.data]);
  const empty = t('vitals.noReadings');

  return (
    <QueryBoundary
      query={{ ...combineQueries(consultations, labs), data: series }}
      isEmpty={(s) => Object.values(s).every((p) => p.length === 0) && hb.length === 0}
      empty={
        <EmptyState
          icon="chart-line"
          title={t('vitals.emptyTitle')}
          message={t('vitals.emptyMessage')}
        />
      }
    >
      {(s) => (
        <>
          <TrendChart
            title={t('vitals.weight')}
            unit="kg"
            primary={s.weight_kg}
            emptyText={empty}
          />
          <TrendChart
            title={t('vitals.bp')}
            unit="mmHg"
            primary={s.bp_systolic}
            secondary={s.bp_diastolic}
            emptyText={empty}
          />
          <TrendChart
            title={t('vitals.fundal')}
            unit="cm"
            primary={s.fundal_height_cm}
            emptyText={empty}
          />
          <TrendChart
            title={t('vitals.fhr')}
            unit="bpm"
            primary={s.fetal_heart_rate}
            emptyText={empty}
          />
          <TrendChart
            title={t('vitals.hb')}
            unit="g/dL"
            primary={hb}
            emptyText={t('vitals.noVerifiedLabs')}
          />
        </>
      )}
    </QueryBoundary>
  );
}
