import { Image, Linking, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';

import { Button, palette, radius, spacing } from '@/components';

import { useReportFileUrl } from '../hooks';
import type { ReportFile } from '../types';
import { InlineError, InlineLoading } from './Inline';

/** "https://host:port/path?x" -> "https://host:port". Used to keep the WebView on the file's host. */
export function originOf(url: string): string | null {
  return /^(https?:\/\/[^/?#]+)/i.exec(url)?.[1] ?? null;
}

interface Props {
  file: ReportFile;
  index: number;
  total: number;
}

/**
 * One page of the original report. The signed link lives 60 seconds, is fetched when the page is
 * shown and is never logged. Photos use Image; PDFs use a WebView with an "Open file" fallback
 * (Android WebViews cannot always render PDFs inline).
 */
export function FileViewer({ file, index, total }: Props) {
  const { t } = useTranslation('patient');
  const url = useReportFileUrl(file.storage_path);
  const isImage = file.mime_type.startsWith('image/');
  const origin = url.data ? originOf(url.data) : null;

  return (
    <View style={styles.box}>
      {total > 1 ? (
        <Text variant="labelMedium" style={styles.muted}>
          {t('reports.pageOf', { page: index + 1, total })}
        </Text>
      ) : null}
      {url.isError ? (
        <View style={styles.stack}>
          <InlineError onRetry={() => void url.refetch()} />
          <Text variant="bodySmall" style={styles.muted}>
            {t('reports.fileHint')}
          </Text>
        </View>
      ) : !url.data ? (
        <InlineLoading />
      ) : isImage ? (
        <Image
          source={{ uri: url.data }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={t('reports.pageImage', { page: index + 1 })}
        />
      ) : (
        <View style={styles.stack}>
          <WebView
            source={{ uri: url.data }}
            style={styles.web}
            originWhitelist={origin ? [`${origin}*`] : []}
            javaScriptEnabled={false}
            allowFileAccess={false}
            nestedScrollEnabled
          />
          <Button
            label={t('reports.openFile')}
            variant="secondary"
            icon="open-in-new"
            onPress={() => void Linking.openURL(url.data)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs },
  stack: { gap: spacing.sm },
  muted: { color: palette.inkMuted },
  image: {
    width: '100%',
    height: 440,
    borderRadius: radius.md,
    backgroundColor: palette.white,
  },
  web: { height: 480, borderRadius: radius.md, backgroundColor: palette.white },
});
