import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, palette, spacing } from '@/components';

import { removeAt, replaceAt } from '../../ai-review';

export interface StringListEditorProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  readOnly?: boolean;
}

export function StringListEditor({
  label,
  items,
  onChange,
  readOnly = false,
}: StringListEditorProps) {
  const { t } = useTranslation('doctor');
  return (
    <View style={styles.group}>
      <Text variant="labelLarge" style={styles.label}>
        {label}
      </Text>
      {items.map((item, i) => (
        <View key={i} style={styles.row}>
          <TextInput
            mode="outlined"
            dense
            style={styles.input}
            multiline
            value={item}
            editable={!readOnly}
            onChangeText={(v) => onChange(replaceAt(items, i, v))}
            accessibilityLabel={`${label} ${i + 1}`}
          />
          {!readOnly ? (
            <Button
              label={t('ai.remove')}
              variant="text"
              onPress={() => onChange(removeAt(items, i))}
              accessibilityLabel={t('ai.removeItem', { label })}
            />
          ) : null}
        </View>
      ))}
      {!readOnly ? (
        <Button label={t('ai.addItem')} variant="text" onPress={() => onChange([...items, ''])} />
      ) : null}
    </View>
  );
}

export interface PairListEditorProps {
  label: string;
  items: { item: string; why: string }[];
  onChange: (items: { item: string; why: string }[]) => void;
  readOnly?: boolean;
}

/** Editable "item + why" pairs (foods to eat / avoid, medicines to check). */
export function PairListEditor({ label, items, onChange, readOnly = false }: PairListEditorProps) {
  const { t } = useTranslation('doctor');
  return (
    <View style={styles.group}>
      <Text variant="labelLarge" style={styles.label}>
        {label}
      </Text>
      {items.map((p, i) => (
        <View key={i} style={styles.pair}>
          <TextInput
            mode="outlined"
            dense
            label={t('ai.item')}
            value={p.item}
            editable={!readOnly}
            onChangeText={(v) => onChange(replaceAt(items, i, { ...p, item: v }))}
          />
          <TextInput
            mode="outlined"
            dense
            multiline
            label={t('ai.why')}
            value={p.why}
            editable={!readOnly}
            onChangeText={(v) => onChange(replaceAt(items, i, { ...p, why: v }))}
          />
          {!readOnly ? (
            <Button
              label={t('ai.remove')}
              variant="text"
              onPress={() => onChange(removeAt(items, i))}
              accessibilityLabel={t('ai.removeItem', { label })}
            />
          ) : null}
        </View>
      ))}
      {!readOnly ? (
        <Button
          label={t('ai.addItem')}
          variant="text"
          onPress={() => onChange([...items, { item: '', why: '' }])}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: { color: palette.maroon },
  row: { gap: spacing.xs },
  input: { backgroundColor: palette.white },
  pair: { gap: spacing.xs, paddingBottom: spacing.sm },
});
