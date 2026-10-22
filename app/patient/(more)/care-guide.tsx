import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Card,
  InfoBanner,
  Screen,
  SectionHeader,
  StatusChip,
  palette,
  spacing,
} from '@/components';
import { todayISO } from '@/domain/pregnancy-math';
import type { GuideItem, GuideKind } from '@/features/patient/care-guide';
import { CallButton } from '@/features/patient/components/CallButton';
import { PatientGate, type ReadyContext } from '@/features/patient/components/PatientGate';
import { QueryBoundary } from '@/features/patient/components/QueryBoundary';
import { useCareGuide, usePullToRefresh } from '@/features/patient/hooks';
import { journeySnapshot } from '@/features/patient/journey';

const DEFAULT_WARNINGS = ['bleeding', 'headache', 'movement', 'fluid', 'pain', 'fever'] as const;

function GuideSection({
  kind,
  items,
  doctorName,
}: {
  kind: Exclude<GuideKind, 'warning_sign'>;
  items: GuideItem[];
  doctorName: string | null;
}) {
  const { t } = useTranslation('patient');
  return (
    <>
      <SectionHeader title={t(`careGuide.${kind}`)} />
      {items.length === 0 ? (
        <Card>
          <Text variant="bodyMedium" style={styles.muted}>
            {t('careGuide.nothing')}
          </Text>
        </Card>
      ) : (
        <View style={styles.stack}>
          {items.map((item) => (
            <Card key={item.key}>
              <Text variant="bodyLarge" style={styles.body}>
                {item.text}
              </Text>
              {item.reason ? (
                <Text variant="bodySmall" style={styles.muted}>
                  {item.reason}
                </Text>
              ) : null}
              <StatusChip
                label={
                  item.source === 'doctor'
                    ? doctorName
                      ? t('careGuide.advisedBy', { name: doctorName })
                      : t('careGuide.advisedByDoctor')
                    : t('careGuide.general')
                }
                tone={item.source === 'doctor' ? 'primary' : 'neutral'}
              />
            </Card>
          ))}
        </View>
      )}
    </>
  );
}

function CareGuideContent({ ctx }: { ctx: ReadyContext }) {
  const { t } = useTranslation('patient');
  const { ga } = journeySnapshot(ctx.edd, todayISO());
  const query = useCareGuide(
    ga.trimester,
    ctx.patient.chronic_conditions,
    ctx.pregnancy.risk_factors,
  );
  return (
    <QueryBoundary query={query}>
      {({ guide, doctorName }) => (
        <>
          {/* Warning signs are always shown, first (PLAN.md §7.2 #6). */}
          <Card variant="soft" title={t('careGuide.warningTitle')}>
            <InfoBanner tone="danger" icon="alert-outline" message={t('careGuide.warningIntro')} />
            {guide.warning_sign.length > 0
              ? guide.warning_sign.map((w) => (
                  <View key={w.key} style={styles.warning}>
                    <Text variant="bodyLarge" style={styles.body}>
                      {w.text}
                    </Text>
                    {w.reason ? (
                      <Text variant="bodySmall" style={styles.muted}>
                        {w.reason}
                      </Text>
                    ) : null}
                  </View>
                ))
              : DEFAULT_WARNINGS.map((k) => (
                  <Text key={k} variant="bodyLarge" style={styles.body}>
                    {t(`careGuide.defaultWarning.${k}`)}
                  </Text>
                ))}
            <CallButton
              phone={ctx.settings.phone}
              label={t('common.callHospital')}
              variant="primary"
            />
          </Card>

          <GuideSection
            kind="food_recommend"
            items={guide.food_recommend}
            doctorName={doctorName}
          />
          <GuideSection kind="food_avoid" items={guide.food_avoid} doctorName={doctorName} />
          <GuideSection kind="med_avoid" items={guide.med_avoid} doctorName={doctorName} />
          <Text variant="bodySmall" style={styles.muted}>
            {t('careGuide.disclaimer')}
          </Text>
        </>
      )}
    </QueryBoundary>
  );
}

// Care guide (PLAN.md §7.2 #6): curated guidance merged with the latest doctor-approved summary.
export default function CareGuideScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>{(ctx) => <CareGuideContent ctx={ctx} />}</PatientGate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  warning: { gap: 2 },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
});
