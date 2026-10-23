import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  EmptyState,
  InfoBanner,
  palette,
  QueryBoundary,
  Screen,
  SectionHeader,
  spacing,
  StatusChip,
  type Tone,
} from '@/components';
import { PatientGate } from '@/features/patient/components/PatientGate';
import { formatStamp } from '@/features/patient/dates';
import { useDoctorMap, usePublishedSummary, usePullToRefresh } from '@/features/patient/hooks';
import { parseSummary, type PatientSummary } from '@/features/patient/summary';

const STATUS_TONE: Record<PatientSummary['key_findings'][number]['status'], Tone> = {
  normal: 'success',
  attention: 'warning',
  urgent: 'danger',
};

function ItemList({ title, items }: { title: string; items: { item: string; why: string }[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <SectionHeader title={title} />
      <Card>
        {items.map((i) => (
          <View key={i.item} style={styles.item}>
            <Text variant="bodyLarge" style={styles.body}>
              {i.item}
            </Text>
            {i.why ? (
              <Text variant="bodySmall" style={styles.muted}>
                {i.why}
              </Text>
            ) : null}
          </View>
        ))}
      </Card>
    </>
  );
}

function TextList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <SectionHeader title={title} />
      <Card>
        {items.map((i) => (
          <View key={i} style={styles.bullet}>
            <Text variant="bodyLarge" style={styles.dot}>
              •
            </Text>
            <Text variant="bodyLarge" style={[styles.body, styles.fill]}>
              {i}
            </Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function SummaryDetail({ id }: { id: string }) {
  const { t } = useTranslation('patient');
  const router = useRouter();
  const query = usePublishedSummary(id);
  const doctors = useDoctorMap();
  return (
    <QueryBoundary query={query}>
      {(row) => {
        const s = parseSummary(row.final);
        if (!s) {
          return (
            <EmptyState
              icon="text-box-remove-outline"
              title={t('summary.unavailableTitle')}
              message={t('summary.unavailableMessage')}
            />
          );
        }
        const doctor = row.reviewed_by ? doctors.get(row.reviewed_by) : undefined;
        return (
          <>
            <Card
              variant="soft"
              title={s.headline || t('summary.untitled')}
              right={<StatusChip label={t('reports.doctorReviewed')} tone="success" />}
            >
              {s.plain_language_summary ? (
                <Text variant="bodyLarge" style={styles.body}>
                  {s.plain_language_summary}
                </Text>
              ) : null}
              <Text variant="bodySmall" style={styles.muted}>
                {[
                  doctor ? t('summary.reviewedBy', { name: doctor.full_name }) : null,
                  formatStamp(row.published_at),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Card>

            {s.key_findings.length > 0 ? (
              <>
                <SectionHeader title={t('summary.findings')} />
                <View style={styles.stack}>
                  {s.key_findings.map((f) => (
                    <Card
                      key={f.finding}
                      title={f.finding}
                      right={
                        <StatusChip
                          label={t(`summary.status.${f.status}`)}
                          tone={STATUS_TONE[f.status]}
                        />
                      }
                    >
                      {f.explanation ? (
                        <Text variant="bodyMedium" style={styles.body}>
                          {f.explanation}
                        </Text>
                      ) : null}
                    </Card>
                  ))}
                </View>
              </>
            ) : null}

            <ItemList title={t('careGuide.food_recommend')} items={s.foods_to_eat} />
            <ItemList title={t('careGuide.food_avoid')} items={s.foods_to_avoid} />
            <ItemList title={t('careGuide.med_avoid')} items={s.medicines_to_avoid} />
            <TextList title={t('summary.tips')} items={s.lifestyle_tips} />
            <TextList title={t('summary.questions')} items={s.questions_for_doctor} />

            <InfoBanner icon="shield-check-outline" message={t('summary.disclaimer')} />
            {row.source_type === 'report' && row.source_id ? (
              <Button
                label={t('summary.seeReport')}
                variant="secondary"
                onPress={() => router.push(`/patient/reports/${row.source_id}`)}
              />
            ) : null}
          </>
        );
      }}
    </QueryBoundary>
  );
}

// Doctor-approved summary (PLAN.md §7.2 #5, §9): plain language, reviewed by the doctor.
export default function SummaryScreen() {
  const { t } = useTranslation('patient');
  const { id } = useLocalSearchParams<{ id: string }>();
  // Blocks screenshots and the recent-apps preview while a summary is open (PLAN.md §12).
  usePreventScreenCapture();
  const { refreshing, onRefresh } = usePullToRefresh();
  return (
    <Screen edges={[]} refreshing={refreshing} onRefresh={onRefresh}>
      <PatientGate>
        {() => (id ? <SummaryDetail id={id} /> : <EmptyState title={t('reports.notFound')} />)}
      </PatientGate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  item: { gap: 2, paddingVertical: spacing.xs },
  bullet: { flexDirection: 'row', gap: spacing.sm },
  fill: { flex: 1 },
  dot: { color: palette.rose },
  body: { color: palette.ink },
  muted: { color: palette.inkMuted },
});
