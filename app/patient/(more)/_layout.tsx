import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderActions } from '@/components';
import { stackScreenOptions } from '@/features/patient/navigation';

// "More" tab: the More menu plus My doctors, Care guide and Prescriptions (URLs stay flat:
// /patient/more, /patient/doctors, /patient/care-guide, /patient/prescriptions).
export const unstable_settings = { initialRouteName: 'more' };

export default function MoreLayout() {
  const { t } = useTranslation('patient');
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="more"
        options={{ title: t('titles.more'), headerRight: () => <HeaderActions /> }}
      />
      <Stack.Screen name="doctors" options={{ title: t('titles.doctors') }} />
      <Stack.Screen name="care-guide" options={{ title: t('titles.careGuide') }} />
      <Stack.Screen name="prescriptions" options={{ title: t('titles.prescriptions') }} />
    </Stack>
  );
}
