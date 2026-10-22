import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { LineChart, type lineDataItem } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next';

import { Card, palette, spacing } from '@/components';

import type { TrendPoint } from '../reports';

export interface TrendSeries {
  name: string;
  color: string;
  points: TrendPoint[];
}

interface Props {
  title: string;
  unit: string;
  series: TrendSeries[];
}

const toData = (points: TrendPoint[]): lineDataItem[] =>
  points.map((p) => ({
    value: p.value,
    label: p.label,
    dataPointText: String(p.value),
    textShiftY: -10,
    textFontSize: 11,
  }));

/** One chart card. Values are printed on the points; a text summary backs it up for screen readers. */
export function TrendChart({ title, unit, series }: Props) {
  const { t } = useTranslation('patient');
  const { width } = useWindowDimensions();
  const filled = series.filter((s) => s.points.length > 0);
  const chartWidth = Math.max(160, width - spacing.md * 4 - 48);
  const longest = Math.max(1, ...filled.map((s) => s.points.length));
  const step = Math.max(48, Math.floor(chartWidth / longest));

  const summary = filled
    .map((s) => `${s.name}: ${s.points.map((p) => `${p.value} ${unit} (${p.label})`).join(', ')}`)
    .join('. ');

  return (
    <Card title={title} subtitle={unit} accessibilityLabel={`${title}. ${summary}`}>
      {filled.length === 0 ? (
        <Text variant="bodyMedium" style={styles.muted}>
          {t('trends.noData')}
        </Text>
      ) : (
        <View accessible accessibilityLabel={summary}>
          <LineChart
            data={toData(filled[0]?.points ?? [])}
            data2={filled[1] ? toData(filled[1].points) : undefined}
            width={chartWidth}
            height={150}
            spacing={step}
            initialSpacing={24}
            endSpacing={24}
            color1={filled[0]?.color ?? palette.rose}
            color2={filled[1]?.color ?? palette.maroon}
            thickness={3}
            dataPointsColor1={filled[0]?.color ?? palette.rose}
            dataPointsColor2={filled[1]?.color ?? palette.maroon}
            noOfSections={4}
            rulesColor={palette.outline}
            yAxisColor={palette.outline}
            xAxisColor={palette.outline}
            yAxisTextStyle={styles.axis}
            xAxisLabelTextStyle={styles.axis}
            isAnimated={false}
            scrollToEnd
          />
          {filled.length > 1 ? (
            <View style={styles.legend}>
              {filled.map((s) => (
                <View key={s.name} style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: s.color }]} />
                  <Text variant="labelMedium" style={styles.muted}>
                    {s.name}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  muted: { color: palette.inkMuted },
  axis: { color: palette.inkMuted, fontSize: 11 },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 12, height: 12, borderRadius: 6 },
});
