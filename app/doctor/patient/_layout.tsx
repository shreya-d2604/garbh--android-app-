import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { palette } from '@/components';

/** Patient chart and its sub-screens (pregnancy management, add report, report detail). */
export default function PatientStackLayout() {
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
      <Stack.Screen name="[pregnancyId]/index" options={{ title: t('chart.title') }} />
      <Stack.Screen name="[pregnancyId]/manage" options={{ title: t('manage.title') }} />
      <Stack.Screen name="[pregnancyId]/add-report" options={{ title: t('report.addTitle') }} />
      <Stack.Screen name="[pregnancyId]/report/[reportId]" options={{ title: t('report.title') }} />
    </Stack>
  );
}
