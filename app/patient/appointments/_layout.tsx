import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderActions } from '@/components';
import { stackScreenOptions } from '@/features/patient/navigation';

export const unstable_settings = { initialRouteName: 'index' };

export default function AppointmentsLayout() {
  const { t } = useTranslation('patient');
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="index"
        options={{ title: t('titles.appointments'), headerRight: () => <HeaderActions /> }}
      />
      <Stack.Screen name="book" options={{ title: t('titles.book') }} />
      <Stack.Screen name="[id]" options={{ title: t('titles.appointment') }} />
    </Stack>
  );
}
