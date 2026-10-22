import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, Card, InfoBanner, Screen, palette, spacing } from '@/components';
import { rpcErrorKey } from '@/domain/rpc-errors';
import { refreshProfile, signOut } from '@/features/auth/session-bootstrap';
import { supabase } from '@/lib/supabase';

/** "Who are you?" (PLAN.md §7.1). The choice sets the role exactly once via complete_signup(). */
export default function WhoAreYou() {
  const { t } = useTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseCompanion = async () => {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('complete_signup', {
      p_kind: 'companion',
      p_details: {},
    });
    if (rpcError) {
      setError(rpcErrorKey(rpcError));
      setBusy(false);
      return;
    }
    await refreshProfile(); // role router now sends the user to /companion (code entry)
  };

  return (
    <Screen title={t('onboarding.whoTitle')} subtitle={t('onboarding.whoSubtitle')}>
      {error ? <InfoBanner tone="danger" message={t(error)} /> : null}
      <Card
        variant="soft"
        onPress={() => router.push('/onboarding/patient-details')}
        accessibilityLabel={t('onboarding.patientOption')}
      >
        <Option
          icon="human-pregnant"
          title={t('onboarding.patientOption')}
          hint={t('onboarding.patientOptionHint')}
        />
      </Card>
      <Card
        onPress={busy ? undefined : chooseCompanion}
        accessibilityLabel={t('onboarding.companionOption')}
      >
        <Option
          icon="account-heart-outline"
          title={t('onboarding.companionOption')}
          hint={t('onboarding.companionOptionHint')}
        />
      </Card>
      <Button
        label={t('actions.signOut')}
        variant="text"
        onPress={() => void signOut()}
        disabled={busy}
      />
    </Screen>
  );
}

function Option({
  icon,
  title,
  hint,
}: {
  icon: 'human-pregnant' | 'account-heart-outline';
  title: string;
  hint: string;
}) {
  return (
    <View style={styles.option}>
      <MaterialCommunityIcons name={icon} size={40} color={palette.rose} />
      <View style={styles.texts}>
        <Text variant="titleMedium" style={styles.title}>
          {title}
        </Text>
        <Text variant="bodyMedium" style={styles.hint}>
          {hint}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  texts: { flex: 1, gap: 2 },
  title: { color: palette.maroon, fontWeight: '600' },
  hint: { color: palette.inkMuted },
});
