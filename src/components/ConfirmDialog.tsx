import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Dialog, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button } from './Button';
import { InfoBanner } from './InfoBanner';
import { palette } from './theme';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  /** Defaults to the common "Cancel". */
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  loading?: boolean;
  /** Fully namespaced i18n key of an error to show inside the dialog. */
  errorKey?: string | null;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  /** Extra content (e.g. a reason field) under the message. */
  children?: ReactNode;
}

/** Confirmation dialog (docs/ui-kit.md: destructive and patient-visible actions need one). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  loading,
  errorKey,
  confirmDisabled,
  onConfirm,
  onDismiss,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={loading ? undefined : onDismiss} style={styles.dialog}>
        <Dialog.Title style={styles.title}>{title}</Dialog.Title>
        <Dialog.Content style={styles.content}>
          {message ? <Text variant="bodyMedium">{message}</Text> : null}
          {children}
          {errorKey ? <InfoBanner tone="danger" message={t(errorKey)} /> : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            label={cancelLabel ?? t('actions.cancel')}
            variant="text"
            onPress={onDismiss}
            disabled={loading}
            fullWidth={false}
          />
          <Button
            label={confirmLabel}
            variant={danger ? 'danger' : 'primary'}
            onPress={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
            fullWidth={false}
          />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { backgroundColor: palette.white },
  title: { color: palette.maroon },
  content: { gap: 12 },
});
