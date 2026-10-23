import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { palette } from '@/components';

/** Consultation form (opened from Today or a chart). */
export default function ConsultLayout() {
  const { t } = useTranslation('doctor');
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.cream },
        headerTitleStyle: { color: palette.maroon },
        headerTintColor: palette.maroon,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="[appointmentId]" options={{ title: t('consult.title') }} />
    </Stack>
  );
}
