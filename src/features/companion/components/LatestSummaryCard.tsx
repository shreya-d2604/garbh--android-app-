import { ActivityIndicator, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Card, ErrorState, palette, StatusChip } from '@/components';

import { formatDay } from '../format';
import { summaryPreview } from '../view';
import { useSummaries } from '../view-hooks';

interface Props {
  patientId: string;
  onPress?: () => void;
}

/** Headline of the newest doctor-approved summary. */
export function LatestSummaryCard({ patientId, onPress }: Props) {
  const { t } = useTranslation('companion');
  const summaries = useSummaries(patientId, true);

  if (summaries.isPending) {
    return (
      <Card title={t('summaries.latest')}>
        <ActivityIndicator color={palette.rose} />
      </Card>
    );
  }
  if (summaries.isError) {
    return (
      <Card title={t('summaries.latest')}>
        <ErrorState onRetry={() => void summaries.refetch()} />
      </Card>
    );
  }

  const latest = summaries.data.summaries[0];
  const preview = latest ? summaryPreview(latest.final) : null;
  return (
    <Card
      title={t('summaries.latest')}
      onPress={onPress}
      accessibilityLabel={t('summaries.latest')}
      right={preview ? <StatusChip label={t('summaries.reviewed')} tone="success" /> : undefined}
    >
      {preview && latest ? (
        <>
          <Text variant="titleMedium">{preview.headline}</Text>
          {latest.published_at ? (
            <Text variant="bodySmall" style={{ color: palette.inkMuted }}>
              {formatDay(latest.published_at)}
            </Text>
          ) : null}
        </>
      ) : (
        <Text variant="bodyMedium" style={{ color: palette.inkMuted }}>
          {t('summaries.noneYet')}
        </Text>
      )}
    </Card>
  );
}
