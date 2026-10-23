import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, ChoiceChips, InfoBanner, palette, spacing } from '@/components';
import type { AiSummary } from '@/domain/schemas/ai-summary';

import { removeAt, replaceAt } from '../../ai-review';
import { PairListEditor, StringListEditor } from './ListEditors';

const STATUSES = ['normal', 'attention', 'urgent'] as const;

export interface SummaryEditorProps {
  value: AiSummary;
  onChange: (next: AiSummary) => void;
  readOnly?: boolean;
}

/** Editable patient-facing summary (PLAN.md §9.3). The doctor-only flags are shown separately and never edited. */
export function SummaryEditor({ value, onChange, readOnly = false }: SummaryEditorProps) {
  const { t } = useTranslation('doctor');
  const set = <K extends keyof AiSummary>(key: K, v: AiSummary[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <Card title={t('ai.summaryTitle')} subtitle={readOnly ? undefined : t('ai.summaryHint')}>
      <TextInput
        mode="outlined"
        label={t('ai.headline')}
        value={value.headline}
        editable={!readOnly}
        onChangeText={(v) => set('headline', v)}
        accessibilityLabel={t('ai.headline')}
      />
      <TextInput
        mode="outlined"
        multiline
        label={t('ai.plain')}
        value={value.plain_language_summary}
        editable={!readOnly}
        onChangeText={(v) => set('plain_language_summary', v)}
        accessibilityLabel={t('ai.plain')}
      />

      <Text variant="labelLarge" style={styles.heading}>
        {t('ai.findings')}
      </Text>
      {value.key_findings.map((f, i) => (
        <View key={i} style={styles.finding}>
          <TextInput
            mode="outlined"
            dense
            label={t('ai.finding')}
            value={f.finding}
            editable={!readOnly}
            onChangeText={(v) =>
              set('key_findings', replaceAt(value.key_findings, i, { ...f, finding: v }))
            }
          />
          <ChoiceChips
            scroll
            allowClear={false}
            value={f.status}
            onChange={(v) =>
              !readOnly &&
              v !== '' &&
              set('key_findings', replaceAt(value.key_findings, i, { ...f, status: v }))
            }
            options={STATUSES.map((s) => ({ value: s, label: t(`ai.status.${s}`) }))}
          />
          <TextInput
            mode="outlined"
            dense
            multiline
            label={t('ai.explanation')}
            value={f.explanation}
            editable={!readOnly}
            onChangeText={(v) =>
              set('key_findings', replaceAt(value.key_findings, i, { ...f, explanation: v }))
            }
          />
          {!readOnly ? (
            <Button
              label={t('ai.remove')}
              variant="text"
              onPress={() => set('key_findings', removeAt(value.key_findings, i))}
            />
          ) : null}
        </View>
      ))}
      {!readOnly ? (
        <Button
          label={t('ai.addItem')}
          variant="text"
          onPress={() =>
            set('key_findings', [
              ...value.key_findings,
              { finding: '', status: 'normal', explanation: '' },
            ])
          }
        />
      ) : null}

      <PairListEditor
        label={t('ai.foodsEat')}
        items={value.foods_to_eat}
        onChange={(v) => set('foods_to_eat', v)}
        readOnly={readOnly}
      />
      <PairListEditor
        label={t('ai.foodsAvoid')}
        items={value.foods_to_avoid}
        onChange={(v) => set('foods_to_avoid', v)}
        readOnly={readOnly}
      />
      <PairListEditor
        label={t('ai.medicines')}
        items={value.medicines_to_avoid}
        onChange={(v) => set('medicines_to_avoid', v)}
        readOnly={readOnly}
      />
      <StringListEditor
        label={t('ai.tips')}
        items={value.lifestyle_tips}
        onChange={(v) => set('lifestyle_tips', v)}
        readOnly={readOnly}
      />
      <StringListEditor
        label={t('ai.questions')}
        items={value.questions_for_doctor}
        onChange={(v) => set('questions_for_doctor', v)}
        readOnly={readOnly}
      />
      {value.confidence_note ? (
        <InfoBanner tone="info" icon="information-outline" message={value.confidence_note} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  heading: { color: palette.maroon, marginTop: spacing.sm },
  finding: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outline,
  },
});
