import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { palette } from '@/components';

interface Props {
  /** 0..1 */
  progress: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  accessibilityLabel?: string;
}

/** Circular progress (journey card). The arc starts at the top and runs clockwise. */
export function ProgressRing({
  progress,
  size = 108,
  stroke = 10,
  children,
  accessibilityLabel,
}: Props) {
  const clamped = Math.min(1, Math.max(0, progress));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={palette.roseSoft}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={palette.rose}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center' } });
