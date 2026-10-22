import { Dialog, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

/** Confirmation for destructive or patient-visible actions (docs/ui-kit.md). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  danger = false,
  loading = false,
  onConfirm,
  onDismiss,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{message}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button label={t('actions.cancel')} variant="text" onPress={onDismiss} disabled={loading} />
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
