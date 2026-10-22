import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, EmptyState, InfoBanner, Screen } from '@/components';

// Placeholder for "Book your first visit" (PLAN.md §7.1). Owner: patient agent.
export default function FirstBooking() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen edges={[]}>
      <InfoBanner message={t('onboarding.verifyBanner')} />
      <EmptyState icon="calendar-heart" title={t('shell.placeholder')} />
      <Button
        label={t('actions.skip')}
        variant="secondary"
        onPress={() => router.replace('/patient')}
      />
    </Screen>
  );
}
