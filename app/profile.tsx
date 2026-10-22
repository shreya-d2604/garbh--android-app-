import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, Card, ListItem, Screen } from '@/components';
import { signOut } from '@/features/auth/session-bootstrap';
import { useSession } from '@/lib/session';

// Minimal profile (PLAN.md §7.1). Owner after the foundation: admin agent
// (adds edit name/photo, notification preferences, "delete my account" -> data_requests).
export default function Profile() {
  const { t } = useTranslation();
  const profile = useSession((s) => s.profile);
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('profile.title') }} />
      <Card title={profile?.full_name ?? ''}>
        <ListItem
          icon="email-outline"
          title={t('profile.email')}
          description={profile?.email ?? ''}
        />
        <ListItem
          icon="badge-account-outline"
          title={t('profile.role')}
          description={profile?.role ? t(`roles.${profile.role}`) : ''}
        />
      </Card>
      <Button label={t('actions.signOut')} variant="secondary" onPress={() => void signOut()} />
    </Screen>
  );
}
