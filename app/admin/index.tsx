import { useTranslation } from 'react-i18next';

import { Card, EmptyState, Screen } from '@/components';
import { useSession } from '@/lib/session';

// Placeholder home. Owner after the foundation: the admin agent (see AGENTS.md).
export default function AdminHome() {
  const { t } = useTranslation();
  const name = useSession((s) => s.profile?.full_name) ?? '';
  return (
    <Screen title={t('shell.welcome', { name })} edges={[]}>
      <Card variant="soft">
        <EmptyState
          icon="shield-account-outline"
          title={t('roles.admin')}
          message={t('shell.placeholder')}
        />
      </Card>
    </Screen>
  );
}
