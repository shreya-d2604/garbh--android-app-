import type { ReactNode } from 'react';
import { Dialog, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button, palette } from '@/components';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
  loading?: boolean;
  /** Destructive action: red confirm button. */
  danger?: boolean;
  children?: ReactNode;
}

/** Confirmation dialog for destructive or irreversible actions (docs/ui-kit.md). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onDismiss,
  loading,
  danger,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ backgroundColor: palette.white }}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          {message ? <Text variant="bodyMedium">{message}</Text> : null}
          {children}
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            label={t('actions.cancel')}
            variant="text"
            onPress={onDismiss}
            disabled={loading}
          />
          <Button
            label={confirmLabel}
            variant={danger ? 'danger' : 'primary'}
            fullWidth={false}
            loading={loading}
            onPress={onConfirm}
          />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
