import { format } from 'date-fns';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Card,
  combineQueries,
  EmptyState,
  ListItem,
  palette,
  QueryBoundary,
  spacing,
  StatusChip,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';

import { groupPrescriptions } from '../../chart';
import { usePregnancyConsultations, usePregnancyPrescriptions } from '../../hooks';
import { isActiveToday } from '../../prescription';

export function PrescriptionsTab({ pregnancyId }: { pregnancyId: string }) {
  const { t } = useTranslation('doctor');
  const items = usePregnancyPrescriptions(pregnancyId);
  const consultations = usePregnancyConsultations(pregnancyId);
  const groups = useMemo(
    () => groupPrescriptions(items.data ?? [], consultations.data ?? []),
    [items.data, consultations.data],
  );
  const today = todayISO();

  return (
    <QueryBoundary
      query={{ ...combineQueries(items, consultations), data: groups }}
      isEmpty={(g) => g.length === 0}
      empty={<EmptyState icon="pill" title={t('rx.emptyTitle')} message={t('rx.emptyMessage')} />}
    >
      {(data) => (
        <>
          {data.map((g) => (
            <Card
              key={g.consultationId}
              title={format(new Date(g.at), 'd MMM yyyy')}
              right={
                <StatusChip
                  label={t(g.published ? 'timeline.published' : 'timeline.draft')}
                  tone={g.published ? 'success' : 'warning'}
                />
              }
            >
              {g.items.map((i) => (
                <View key={i.id} style={styles.row}>
                  <ListItem
                    icon="pill"
                    title={[i.drug_name, i.strength].filter(Boolean).join(' ')}
                    description={[
                      i.dose,
                      i.frequency,
                      i.timing,
                      i.duration_days ? t('rx.days', { count: i.duration_days }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    right={
                      isActiveToday(i, today) ? (
                        <StatusChip label={t('rx.active')} tone="success" />
                      ) : undefined
                    }
                  />
                  {i.instructions ? (
                    <Text variant="bodySmall" style={styles.note}>
                      {i.instructions}
                    </Text>
                  ) : null}
                </View>
              ))}
            </Card>
          ))}
        </>
      )}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  note: { color: palette.inkMuted, paddingLeft: 56, paddingBottom: spacing.xs },
});
