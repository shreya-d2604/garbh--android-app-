import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card, StatusChip, spacing } from '@/components';
import { todayISO } from '@/domain/pregnancy-math';

import { formatGa, gaFromEdd } from '../format';
import type { PatientListItem } from '../patient-list';

export function PatientRow({
  item,
  onPress,
}: {
  item: PatientListItem;
  onPress: (item: PatientListItem) => void;
}) {
  const { t } = useTranslation('doctor');
  const ga = gaFromEdd(item.eddFinal, todayISO());
  const subtitle = [item.mrn ?? t('patients.noMrn'), ga ? formatGa(ga) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card
      title={item.name}
      subtitle={subtitle}
      onPress={() => onPress(item)}
      accessibilityLabel={t('patients.open', { name: item.name })}
      right={
        <StatusChip
          label={t(`patients.role.${item.careRole}`)}
          tone={item.careRole === 'primary' ? 'primary' : 'neutral'}
        />
      }
    >
      <View style={styles.chips}>
        {item.riskLevel === 'high' ? (
          <StatusChip label={t('chart.highRisk')} tone="danger" />
        ) : null}
        {item.riskLevel === 'moderate' ? (
          <StatusChip label={t('chart.moderateRisk')} tone="warning" />
        ) : null}
        {item.overdueVisits > 0 ? (
          <StatusChip label={t('patients.overdue', { count: item.overdueVisits })} tone="warning" />
        ) : null}
        {!item.verified ? <StatusChip label={t('chart.unverified')} tone="warning" /> : null}
        {item.status !== 'active' ? (
          <StatusChip label={t(`chart.outcome.${item.status}`)} tone="neutral" />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
