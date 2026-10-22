import { StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { palette, spacing } from '@/components';

import { PERMISSION_KEYS, type PermissionKey, type PermissionState } from '../permissions';

interface Props {
  value: PermissionState;
  onChange: (next: PermissionState) => void;
  disabled?: boolean;
}

/** One switch per thing a companion may see (PLAN.md §7.2 #8). Label + hint come from i18n. */
export function PermissionToggles({ value, onChange, disabled }: Props) {
  const { t } = useTranslation('companion');
  const toggle = (key: PermissionKey, on: boolean) => onChange({ ...value, [key]: on });
  return (
    <View style={styles.list}>
      {PERMISSION_KEYS.map((key) => (
        <View key={key} style={styles.row}>
          <View style={styles.texts}>
            <Text variant="bodyLarge" style={styles.label}>
              {t(`perms.${key}.label`)}
            </Text>
            <Text variant="bodySmall" style={styles.hint}>
              {t(`perms.${key}.hint`)}
            </Text>
          </View>
          <Switch
            value={value[key]}
            onValueChange={(on) => toggle(key, on)}
            disabled={disabled}
            color={palette.rose}
            accessibilityLabel={t(`perms.${key}.label`)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.xs,
  },
  texts: { flex: 1, gap: 2 },
  label: { color: palette.ink },
  hint: { color: palette.inkMuted },
});
