import { useState } from 'react';
import { TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { reasonSchema } from '../schemas';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

interface Props extends Omit<ConfirmDialogProps, 'onConfirm' | 'children' | 'confirmDisabled'> {
  /** Shortest accepted reason. */
  minLength?: number;
  /** When set, the admin must also type this word (second confirmation for hard delete). */
  confirmWord?: string;
  onConfirm: (reason: string) => void;
}

/** Dialog that asks for a written reason (and optionally a typed word) before a risky action. */
export function ReasonDialog(props: Props) {
  // Re-keyed on open / close so the typed text never survives into the next use.
  return <ReasonDialogBody key={props.visible ? 'open' : 'closed'} {...props} />;
}

function ReasonDialogBody({ minLength = 3, confirmWord, onConfirm, ...rest }: Props) {
  const { t } = useTranslation('admin');
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');

  const reasonOk = reasonSchema(minLength).safeParse({ reason }).success;
  const wordOk = !confirmWord || typed.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <ConfirmDialog {...rest} confirmDisabled={!reasonOk || !wordOk} onConfirm={() => onConfirm(reason.trim())}>
      <TextInput
        mode="outlined"
        label={t('dialogs.reason')}
        value={reason}
        onChangeText={setReason}
        multiline
        accessibilityLabel={t('dialogs.reason')}
      />
      {confirmWord ? (
        <TextInput
          mode="outlined"
          label={t('dialogs.typeToConfirm', { word: confirmWord })}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={t('dialogs.typeToConfirm', { word: confirmWord })}
        />
      ) : null}
    </ConfirmDialog>
  );
}
