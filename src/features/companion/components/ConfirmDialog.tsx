import { Dialog, Portal, Text } from 'react-native-paper';

import { Button } from '@/components';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

/** Confirmation for destructive actions (docs/ui-kit.md): danger button + cancel. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  loading,
  onConfirm,
  onDismiss,
}: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={loading ? undefined : onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{message}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button label={cancelLabel} variant="text" onPress={onDismiss} disabled={loading} />
          <Button
            label={confirmLabel}
            variant="danger"
            fullWidth={false}
            loading={loading}
            onPress={onConfirm}
          />
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
