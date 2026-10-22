import { useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Card, palette, spacing } from '@/components';

import { withArticle } from '../format';
import type { WeekContent } from '../types';

interface Props {
  rows: WeekContent[];
  /** Index of the row to show first (the patient's current week). */
  initialIndex: number;
}

/** Week-by-week swiper: baby development, changes in the mother, tips. Swipe or use arrows. */
export function WeekSwiper({ rows, initialIndex }: Props) {
  const { t } = useTranslation('patient');
  const { width } = useWindowDimensions();
  const pageWidth = width - spacing.md * 2;
  const listRef = useRef<FlatList<WeekContent>>(null);
  const [index, setIndex] = useState(initialIndex);

  const go = (next: number) => {
    const clamped = Math.min(rows.length - 1, Math.max(0, next));
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  };

  return (
    <View style={styles.box}>
      <View style={styles.nav}>
        <IconButton
          icon="chevron-left"
          accessibilityLabel={t('journey.previousWeek')}
          disabled={index === 0}
          onPress={() => go(index - 1)}
        />
        <Text variant="titleMedium" style={styles.navTitle}>
          {t('journey.weekN', { week: rows[index]?.week })}
        </Text>
        <IconButton
          icon="chevron-right"
          accessibilityLabel={t('journey.nextWeek')}
          disabled={index === rows.length - 1}
          onPress={() => go(index + 1)}
        />
      </View>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => String(r.week)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: pageWidth, offset: pageWidth * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
        renderItem={({ item }) => (
          <View style={{ width: pageWidth }}>
            <Card>
              {item.baby_size_label ? (
                <Text variant="titleSmall" style={styles.heading}>
                  {t('journey.babySize', { size: withArticle(item.baby_size_label) })}
                </Text>
              ) : null}
              {item.baby_length_cm != null || item.baby_weight_g != null ? (
                <Text variant="bodySmall" style={styles.muted}>
                  {[
                    item.baby_length_cm != null
                      ? t('journey.length', { value: item.baby_length_cm })
                      : null,
                    item.baby_weight_g != null
                      ? t('journey.weight', { value: item.baby_weight_g })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
              <Block title={t('journey.babyDevelopment')} text={item.baby_development} />
              <Block title={t('journey.yourBody')} text={item.mother_changes} />
              <Block title={t('journey.tipsTitle')} text={item.tips} />
            </Card>
          </View>
        )}
      />
    </View>
  );
}

function Block({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.block}>
      <Text variant="labelLarge" style={styles.heading}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navTitle: { color: palette.maroon, fontWeight: '700' },
  heading: { color: palette.maroon, fontWeight: '700' },
  muted: { color: palette.inkMuted },
  block: { gap: 2 },
  body: { color: palette.ink },
});
