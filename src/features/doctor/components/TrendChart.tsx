import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Text } from 'react-native-paper';

import { Card, palette, spacing } from '@/components';

import type { SeriesPoint } from '../chart';

export interface TrendChartProps {
  title: string;
  unit?: string;
  primary: readonly SeriesPoint[];
  /** Optional second line (e.g. diastolic BP). */
  secondary?: readonly SeriesPoint[];
  emptyText: string;
}

const toData = (points: readonly SeriesPoint[]) =>
  points.map((p) => ({ value: p.value, label: p.label }));

/** One small line chart card; shows a plain sentence when there are no readings yet. */
export function TrendChart({ title, unit, primary, secondary, emptyText }: TrendChartProps) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(220, width - spacing.md * 4 - 40);
  const last = primary[primary.length - 1];
  return (
    <Card
      title={title}
      subtitle={last ? `${last.value}${unit ? ` ${unit}` : ''} · ${last.label}` : undefined}
    >
      {primary.length === 0 ? (
        <Text variant="bodyMedium" style={styles.empty}>
          {emptyText}
        </Text>
      ) : (
        <View style={styles.chart} accessibilityLabel={title}>
          <LineChart
            data={toData(primary)}
            data2={secondary && secondary.length > 0 ? toData(secondary) : undefined}
            width={chartWidth}
            height={150}
            color1={palette.rose}
            color2={palette.info}
            dataPointsColor1={palette.rose}
            dataPointsColor2={palette.info}
            thickness={2}
            spacing={Math.max(36, chartWidth / Math.max(primary.length, 4))}
            initialSpacing={12}
            noOfSections={4}
            hideRules
            yAxisTextStyle={styles.axis}
            xAxisLabelTextStyle={styles.axis}
            yAxisColor={palette.outline}
            xAxisColor={palette.outline}
            adjustToWidth={false}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: { color: palette.inkMuted },
  chart: { paddingTop: spacing.sm, overflow: 'hidden' },
  axis: { color: palette.inkMuted, fontSize: 11 },
});
