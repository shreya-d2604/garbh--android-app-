import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { palette, spacing } from '@/components';

import { formatDate } from '../dates';
import { frequencyHint } from '../medicines';
import type { PrescriptionItem } from '../types';

/** One medicine exactly as the doctor wrote it, plus a plain "morning / night" hint for 1-0-1 style dosing. */
export function MedicineRow({
  item,
  showUntil = true,
}: {
  item: PrescriptionItem;
  showUntil?: boolean;
}) {
  const { t } = useTranslation('patient');
  const hint = frequencyHint(item.frequency);
  const how = [item.dose, item.frequency, item.timing, item.route].filter(Boolean).join(' · ');
  return (
    <View style={styles.row}>
      <Text variant="titleSmall" style={styles.name}>
        {[item.drug_name, item.strength, item.dosage_form].filter(Boolean).join(' ')}
      </Text>
      {how ? (
        <Text variant="bodyMedium" style={styles.body}>
          {how}
        </Text>
      ) : null}
      {hint ? (
        <Text variant="bodySmall" style={styles.muted}>
          {hint.map((h) => t(`medicines.slot.${h}`)).join(', ')}
        </Text>
      ) : null}
      {item.instructions ? (
        <Text variant="bodySmall" style={styles.muted}>
          {item.instructions}
        </Text>
      ) : null}
      {showUntil && item.end_date ? (
        <Text variant="bodySmall" style={styles.muted}>
          {t('medicines.until', { date: formatDate(item.end_date) })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2, paddingVertical: spacing.xs },
  name: { color: palette.maroon, fontWeight: '700' },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
});
