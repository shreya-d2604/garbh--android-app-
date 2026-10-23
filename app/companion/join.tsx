import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card, Screen } from '@/components';
import { CodeEntryForm } from '@/features/companion/components/CodeEntryForm';

/** Follow one more person (a companion can follow several patients). */
export default function JoinAnother() {
  const { t } = useTranslation('companion');
  const router = useRouter();
  return (
    <Screen edges={['bottom']} title={t('join.addAnotherTitle')} subtitle={t('join.subtitle')}>
      <Card>
        <CodeEntryForm onRedeemed={() => router.replace('/companion/people')} />
      </Card>
    </Screen>
  );
}
