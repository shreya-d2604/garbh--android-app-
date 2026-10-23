import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, EmptyState } from '@/components';

interface Props {
  message: string;
}

/** A request / companion that no longer exists or is no longer open. */
export function ClosedState({ message }: Props) {
  const { t } = useTranslation('companion');
  const router = useRouter();
  return (
    <>
      <EmptyState icon="account-off-outline" title={message} />
      <Button
        label={t('request.back')}
        variant="secondary"
        onPress={() => router.replace('/patient/companions')}
        accessibilityLabel={t('request.back')}
      />
    </>
  );
}
