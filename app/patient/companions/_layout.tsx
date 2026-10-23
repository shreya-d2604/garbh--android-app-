import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { palette } from '@/components';
import { useMyPatient, usePatientLinksRealtime } from '@/features/companion/hooks';

/** "My Companions" (PLAN.md §7.2 #8). Own header: the patient tabs should hide this route's header. */
export default function PatientCompanionsLayout() {
  const { t } = useTranslation('companion');
  const me = useMyPatient();
  // New requests and revocations show up live on every screen of this stack.
  usePatientLinksRealtime(me.data?.id);
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.cream },
        headerTitleStyle: { color: palette.maroon },
        headerTintColor: palette.maroon,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: t('my.title') }} />
      <Stack.Screen name="invite" options={{ title: t('invite.title') }} />
      <Stack.Screen name="request/[linkId]" options={{ title: t('request.title') }} />
      <Stack.Screen name="[linkId]" options={{ title: t('detail.title') }} />
    </Stack>
  );
}
