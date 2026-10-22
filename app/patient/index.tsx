import { useTranslation } from 'react-i18next';

import { Card, EmptyState, Screen } from '@/components';
import { useSession } from '@/lib/session';

// Placeholder home. Owner after the foundation: the patient agent (see AGENTS.md).
export default function PatientHome() {
  const { t } = useTranslation();
  const name = useSession((s) => s.profile?.full_name) ?? '';
  return (
    <Screen title={t('shell.welcome', { name })} edges={[]}>
      <Card variant="soft">
        <EmptyState
          icon="human-pregnant"
          title={t('roles.patient')}
          message={t('shell.placeholder')}
        />
      </Card>
    </Screen>
  );
}
