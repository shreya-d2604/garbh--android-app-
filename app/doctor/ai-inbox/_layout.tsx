import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderActions, palette } from '@/components';

/** AI inbox tab: the list, and the review screen for one summary. */
export default function AiInboxLayout() {
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
      <Stack.Screen name="index" options={{ title: t('tabs.aiInbox'), headerRight: () => <HeaderActions /> }} />
      <Stack.Screen name="[summaryId]" options={{ title: t('ai.reviewTitle') }} />
    </Stack>
  );
}
