import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card, ListItem, Screen } from '@/components';

/** "More": configuration, audit log and DPDP requests. */
export default function More() {
  const { t } = useTranslation('admin');
  const router = useRouter();
  return (
    <Screen edges={[]} title={t('more.title')}>
      <Stack.Screen options={{ title: t('more.title') }} />
      <Card>
        <ListItem
          icon="cog-outline"
          title={t('more.config')}
          description={t('more.configHint')}
          onPress={() => router.push('/admin/more/config')}
        />
        <ListItem
          icon="history"
          title={t('more.audit')}
          description={t('more.auditHint')}
          onPress={() => router.push('/admin/more/audit')}
        />
        <ListItem
          icon="inbox-arrow-down-outline"
          title={t('more.requests')}
          description={t('more.requestsHint')}
          onPress={() => router.push('/admin/more/requests')}
        />
      </Card>
    </Screen>
  );
}
