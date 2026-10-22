import { format } from 'date-fns';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, InfoBanner, StatusChip, palette, spacing } from '@/components';
import { todayISO } from '@/domain/pregnancy-math';

import type { ChartData } from '../../api';
import { ageInYears, formatGa, formatGpal, gaFromEdd } from '../../format';

const RISK_TONE = { low: 'success', moderate: 'warning', high: 'danger' } as const;

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

export function ChartHeader({ chart, onManage }: { chart: ChartData; onManage: () => void }) {
  const { t } = useTranslation('doctor');
  const { patient, pregnancy } = chart;
  const today = todayISO();
  const ga = gaFromEdd(pregnancy.edd_final, today);
  const age = ageInYears(patient.dob, today);
  const blood = [patient.blood_group, patient.rh_negative ? t('chart.rhNegative') : null].filter(Boolean).join(' · ');
  const facts = [
    age !== null ? t('chart.age', { years: age }) : null,
    formatGpal(pregnancy),
    blood || null,
    patient.mrn ?? t('patients.noMrn'),
  ].filter(Boolean);

  return (
    <Card variant="soft" title={patient.full_name} subtitle={facts.join(' · ')}>
      <View style={styles.chips}>
        <StatusChip label={t(`chart.risk.${pregnancy.risk_level}`)} tone={RISK_TONE[pregnancy.risk_level]} />
        {!patient.is_verified ? <StatusChip label={t('chart.unverified')} tone="warning" /> : null}
        {pregnancy.lmp_source === 'patient_reported' ? (
          <StatusChip label={t('chart.lmpReported')} tone="warning" />
        ) : null}
        {pregnancy.status !== 'active' ? (
          <StatusChip label={t(`chart.outcome.${pregnancy.status}`)} tone="neutral" />
        ) : null}
        {pregnancy.multiple_gestation > 1 ? (
          <StatusChip label={t('chart.multiple', { n: pregnancy.multiple_gestation })} tone="info" />
        ) : null}
      </View>

      {patient.allergies.length > 0 ? (
        <View style={styles.allergies} accessibilityLabel={t('chart.allergies')}>
          <Text variant="labelMedium" style={styles.label}>
            {t('chart.allergies')}
          </Text>
          <View style={styles.chips}>
            {patient.allergies.map((a) => (
              <StatusChip key={a} label={a} tone="danger" />
            ))}
          </View>
        </View>
      ) : null}
      {patient.chronic_conditions.length > 0 ? (
        <Text variant="bodySmall" style={styles.label}>
          {t('chart.conditions', { list: patient.chronic_conditions.join(', ') })}
        </Text>
      ) : null}

      <View style={styles.gaRow}>
        {ga && pregnancy.status === 'active' ? (
          <Text variant="titleMedium" style={styles.ga}>
            {t('chart.ga', { ga: formatGa(ga), trimester: ga.trimester })}
          </Text>
        ) : null}
        {pregnancy.edd_final ? (
          <Text variant="bodyMedium" style={styles.label}>
            {t('chart.edd', { date: format(toDate(pregnancy.edd_final), 'd MMM yyyy') })}
          </Text>
        ) : (
          <Text variant="bodyMedium" style={styles.label}>
            {t('chart.noEdd')}
          </Text>
        )}
      </View>

      {pregnancy.lmp_source === 'patient_reported' ? (
        <InfoBanner tone="warning" icon="calendar-alert" message={t('chart.lmpReportedHint')} />
      ) : null}
      <Button label={t('chart.manage')} variant="secondary" onPress={onManage} />
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  allergies: { gap: spacing.xs },
  label: { color: palette.inkMuted },
  gaRow: { gap: 2 },
  ga: { color: palette.maroon, fontWeight: '700' },
});
