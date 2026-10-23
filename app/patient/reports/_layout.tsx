import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderActions } from '@/components';
import { stackScreenOptions } from '@/features/patient/navigation';

export const unstable_settings = { initialRouteName: 'index' };

export default function ReportsLayout() {
  const { t } = useTranslation('patient');
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="index"
        options={{ title: t('titles.reports'), headerRight: () => <HeaderActions /> }}
      />
      <Stack.Screen name="trends" options={{ title: t('titles.trends') }} />
      <Stack.Screen name="[id]" options={{ title: t('titles.report') }} />
      <Stack.Screen name="summaries/[id]" options={{ title: t('titles.summary') }} />
    </Stack>
  );
}
