import { useTranslation } from 'react-i18next';

import { EmptyState, InfoBanner, palette, QueryBoundary, Screen } from '@/components';
import { PatientGate, type ReadyContext } from '@/features/patient/components/PatientGate';
import { TrendChart } from '@/features/patient/components/TrendChart';
import { usePullToRefresh, useTrends } from '@/features/patient/hooks';
import { hasAnyTrend } from '@/features/patient/reports';

function TrendsContent({ ctx }: { ctx: ReadyContext }) {
  const { t } = useTranslation('patient');
  const query = useTrends(ctx.edd);
  return (
    <QueryBoundary
      query={query}
      isEmpty={(trends) => !hasAnyTrend(trends)}
      empty={
        <EmptyState
          icon="chart-line"
          title={t('trends.emptyTitle')}
          message={t('trends.emptyMessage')}
        />
      }
    >
      {(trends) => (
        <>
          <InfoBanner icon="check-decagram-outline" message={t('trends.verifiedOnly')} />
          <TrendChart
            title={t('trends.hb')}
            unit="g/dL"
            series={[{ name: t('trends.hb'), color: palette.rose, points: trends.hb }]}
          />
          <TrendChart
            title={t('trends.weight')}
            unit="kg"
            series={[{ name: t('trends.weight'), color: palette.maroon, points: trends.weight }]}
          />
          <TrendChart
            title={t('trends.bp')}
            unit="mmHg"
            series={[
              { name: t('trends.systolic'), color: palette.rose, points: trends.systolic },
              { name: t('trends.diastolic'), color: palette.info, points: trends.diastolic },
            ]}
          />
          <TrendChart
            title={t('trends.fastingSugar')}
            unit="mg/dL"
            series={[
              {
                name: t('trends.fastingSugar'),
                color: palette.success,
                points: trends.fastingSugar,
              },
            ]}
          />
          <TrendChart
            title={t('trends.postMealSugar')}
            unit="mg/dL"
            series={[
              {
                name: t('trends.postMealSugar'),
                color: palette.warning,
                points: trends.postMealSugar,
              },
            ]}
          />
        </>
      )}
    </QueryBoundary>
  );
}

// Trends (PLAN.md §7.2 #5): Hb, weight, BP and sugar across the pregnancy, verified values only.
export default function TrendsScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>{(ctx) => <TrendsContent ctx={ctx} />}</PatientGate>
    </Screen>
  );
}
