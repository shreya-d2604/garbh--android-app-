import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card, ListItem, Screen } from '@/components';
import { CONFIG_KEYS, CONFIG_TABLES, SINGLE_CONFIGS } from '@/features/admin/config';

/** Configuration (PLAN.md §7.6 #5): every editor in one list. */
export default function Configuration() {
  const { t } = useTranslation('admin');
  const router = useRouter();
  return (
    <Screen edges={['bottom']} title={t('config.title')} subtitle={t('config.subtitle')}>
      <Stack.Screen options={{ title: t('config.title') }} />
      <Card>
        <ListItem
          icon={SINGLE_CONFIGS.booking.icon as never}
          title={t('config.single.booking')}
          description={t('config.single.bookingSummary')}
          onPress={() => router.push('/admin/more/config/booking')}
        />
        <ListItem
          icon={SINGLE_CONFIGS.hospital.icon as never}
          title={t('config.single.hospital')}
          description={t('config.single.hospitalSummary')}
          onPress={() => router.push('/admin/more/config/hospital')}
        />
        {CONFIG_KEYS.map((key) => (
          <ListItem
            key={key}
            icon={CONFIG_TABLES[key].icon as never}
            title={t(`config.tables.${key}.title`)}
            description={t(`config.tables.${key}.summary`)}
            onPress={() => router.push(`/admin/more/config/${key}` as never)}
          />
        ))}
      </Card>
    </Screen>
  );
}
