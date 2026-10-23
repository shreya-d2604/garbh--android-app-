import { Image, Linking, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, palette, radius, spacing } from '@/components';

import { useSignedUrl } from '../hooks';
import type { ReportFileRow } from '../types';

/** One page of a report: photos are shown in place; PDFs open in the phone's PDF viewer (60 s signed link). */
export function ReportPageView({
  file,
}: {
  file: Pick<ReportFileRow, 'storage_path' | 'mime_type' | 'page_no'>;
}) {
  const { t } = useTranslation('doctor');
  const url = useSignedUrl(file.storage_path);
  const isPdf = file.mime_type === 'application/pdf';

  return (
    <View style={styles.box} accessibilityLabel={t('report.page', { n: file.page_no })}>
      <Text variant="labelMedium" style={styles.label}>
        {t('report.page', { n: file.page_no })}
      </Text>
      {url.isPending ? (
        <ActivityIndicator color={palette.rose} />
      ) : url.isError || !url.data ? (
        <Button
          label={t('report.fileRetry')}
          variant="secondary"
          onPress={() => void url.refetch()}
        />
      ) : isPdf ? (
        <Button
          label={t('report.openPdf')}
          variant="secondary"
          onPress={() => void Linking.openURL(url.data)}
        />
      ) : (
        <Image
          source={{ uri: url.data }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={t('report.page', { n: file.page_no })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs },
  label: { color: palette.inkMuted },
  image: { width: '100%', height: 420, borderRadius: radius.sm, backgroundColor: palette.cream },
});
