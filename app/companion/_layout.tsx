import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderActions, palette } from '@/components';
import { useCompanionLinksRealtime } from '@/features/companion/hooks';

/** Companion area: code entry -> waiting -> read-only views of each followed patient. */
export default function CompanionLayout() {
  const { t } = useTranslation('companion');
  // One live subscription for the whole area: approval, rejection and revocation update every screen.
  useCompanionLinksRealtime();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.cream },
        headerTitleStyle: { color: palette.maroon },
        headerTintColor: palette.maroon,
        headerShadowVisible: false,
        headerRight: () => <HeaderActions />,
      }}
    >
      <Stack.Screen name="index" options={{ title: t('title') }} />
      <Stack.Screen name="join" options={{ title: t('join.addAnotherTitle') }} />
      <Stack.Screen name="people" options={{ title: t('people.title') }} />
      <Stack.Screen name="[patientId]" options={{ headerShown: false }} />
    </Stack>
  );
}
