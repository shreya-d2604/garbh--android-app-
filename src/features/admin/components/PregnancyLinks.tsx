import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Card, ListItem } from '@/components';

import { usePregnancyOwner } from '../hooks';

/** Shortcuts from a data-quality item to the patient, the pregnancy and its care team. */
export function PregnancyLinks({ pregnancyId }: { pregnancyId: string | null }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const owner = usePregnancyOwner(pregnancyId);
  if (!owner.data || !pregnancyId) return null;
  const base = `/admin/patients/${owner.data.patient_id}`;
  return (
    <Card title={t('dq.fix.related')}>
      <ListItem
        icon="account-outline"
        title={t('dq.fix.openPatient')}
        onPress={() => router.push(base as never)}
      />
      <ListItem
        icon="human-pregnant"
        title={t('dq.fix.openPregnancy')}
        onPress={() => router.push(`${base}/pregnancy/${pregnancyId}` as never)}
      />
      <ListItem
        icon="account-group-outline"
        title={t('careTeam.title')}
        description={t('dq.fix.careTeamHint')}
        onPress={() => router.push(`${base}/pregnancy/${pregnancyId}/care-team` as never)}
      />
    </Card>
  );
}
