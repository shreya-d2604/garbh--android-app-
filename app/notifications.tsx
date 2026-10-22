import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState, Screen } from '@/components';

// Placeholder notifications inbox (PLAN.md §7.1). Owner: backend agent.
export default function Notifications() {
  const { t } = useTranslation();
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('shell.notifications') }} />
      <EmptyState icon="bell-outline" title={t('states.empty')} />
    </Screen>
  );
}
