import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState, Screen } from '@/components';
import { firstParam } from '@/features/admin/components/ui';
import { isDqRule } from '@/features/admin/data-quality';
import { AiDraftFix } from '@/features/admin/fixes/AiDraftFix';
import { ConsultationFix } from '@/features/admin/fixes/ConsultationFix';
import { ImplausibleFix } from '@/features/admin/fixes/ImplausibleFix';
import { PastBookedFix } from '@/features/admin/fixes/PastBookedFix';
import { ReportValuesFix } from '@/features/admin/fixes/ReportValuesFix';

/** Fix screen for record-level data-quality items (appointment, consultation, report, AI draft, vitals). */
export default function DataQualityItem() {
  const { t } = useTranslation('admin');
  const params = useLocalSearchParams<{ rule: string; id: string }>();
  const rule = firstParam(params.rule);
  const id = firstParam(params.id);

  let body = <EmptyState title={t('dq.unknownRule')} icon="help-circle-outline" />;
  if (isDqRule(rule) && id) {
    switch (rule) {
      case 'past_booked':
        body = <PastBookedFix id={id} />;
        break;
      case 'consult_unpublished':
        body = <ConsultationFix id={id} />;
        break;
      case 'lab_unverified_48h':
        body = <ReportValuesFix id={id} />;
        break;
      case 'ai_draft_24h':
        body = <AiDraftFix id={id} />;
        break;
      case 'implausible_values':
        body = <ImplausibleFix id={id} />;
        break;
    }
  }
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen
        options={{ title: isDqRule(rule) ? t(`dq.rules.${rule}.title`) : t('dq.title') }}
      />
      {body}
    </Screen>
  );
}
