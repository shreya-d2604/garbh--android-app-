import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Checkbox, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, InfoBanner, Screen, palette } from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import { refreshProfile, signOut } from '@/features/auth/session-bootstrap';
import { supabase } from '@/lib/supabase';

const ITEMS = ['terms', 'data', 'ai'] as const;

/** Terms + Privacy + AI-processing consent (PLAN.md §7.1, §12). All three are required. */
export default function Consent() {
  const { t } = useTranslation();
  const [checked, setChecked] = useState<Record<(typeof ITEMS)[number], boolean>>({
    terms: false,
    data: false,
    ai: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allChecked = ITEMS.every((k) => checked[k]);

  const onAccept = async () => {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('record_consent');
    if (rpcError) setError(rpcErrorKey(rpcError));
    else await refreshProfile();
    setBusy(false);
  };

  return (
    <Screen title={t('consent.title')}>
      <Text variant="bodyLarge" style={styles.intro}>
        {t('consent.intro')}
      </Text>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <Card>
        {ITEMS.map((key) => (
          <Checkbox.Item
            key={key}
            label={t(`consent.${key}`)}
            status={checked[key] ? 'checked' : 'unchecked'}
            onPress={() => setChecked((c) => ({ ...c, [key]: !c[key] }))}
            position="leading"
            labelStyle={styles.label}
            labelVariant="bodyMedium"
          />
        ))}
      </Card>
      <Button
        label={t('consent.accept')}
        onPress={onAccept}
        disabled={!allChecked}
        loading={busy}
      />
      <Button label={t('actions.signOut')} variant="text" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { color: palette.ink },
  label: { textAlign: 'left' },
});
