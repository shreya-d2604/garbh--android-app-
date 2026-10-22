import { format } from 'date-fns';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { APPOINTMENT_STATUS_TONE, Button, Card, StatusChip, spacing } from '@/components';
import { todayISO } from '@/domain/pregnancy-math';

import { formatGa, gaFromEdd } from '../format';
import { canStart, queueChips, type QueueItem } from '../queue';

export interface QueueCardProps {
  item: QueueItem;
  starting?: boolean;
  onStart: (item: QueueItem) => void;
  onContinue: (item: QueueItem) => void;
  onOpenChart: (item: QueueItem) => void;
}

/** One appointment in the Today queue: who, when, chips, and the next action. */
export function QueueCard({ item, starting = false, onStart, onContinue, onOpenChart }: QueueCardProps) {
  const { t } = useTranslation('doctor');
  const chips = queueChips(item);
  const ga = gaFromEdd(item.eddFinal, todayISO());
  const time = format(new Date(item.startsAt), 'h:mm a');
  const subtitle = [time, item.reason].filter(Boolean).join(' · ');

  return (
    <Card
      title={item.patientName}
      subtitle={subtitle}
      onPress={() => onOpenChart(item)}
      accessibilityLabel={t('today.openChart', { name: item.patientName })}
      right={<StatusChip label={t(`common:status.${item.status}`)} tone={APPOINTMENT_STATUS_TONE[item.status]} />}
    >
      <View style={styles.chips}>
        {chips.app ? <StatusChip label={t('today.appChip')} tone="info" /> : null}
        {chips.newUnverified ? <StatusChip label={t('today.newUnverified')} tone="warning" /> : null}
        {item.riskLevel === 'high' ? <StatusChip label={t('chart.highRisk')} tone="danger" /> : null}
        {ga ? <StatusChip label={formatGa(ga)} tone="neutral" /> : null}
      </View>
      {canStart(item.status) ? (
        <Button
          label={t('today.start')}
          loading={starting}
          onPress={() => onStart(item)}
          accessibilityLabel={t('today.startFor', { name: item.patientName })}
        />
      ) : item.status === 'in_consultation' ? (
        <Button label={t('today.continue')} onPress={() => onContinue(item)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
