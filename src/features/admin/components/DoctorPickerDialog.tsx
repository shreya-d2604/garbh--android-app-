import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { TextInput } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { DoctorChoice, type DoctorOption } from './DoctorChoice';

import { ConfirmDialog } from '@/components';

interface Props {
  visible: boolean;
  title: string;
  confirmLabel: string;
  doctors: readonly DoctorOption[];
  excludeIds?: readonly string[];
  /** Ask for an optional note (e.g. "Covers Dr. A's leave"). */
  withNote?: boolean;
  loading?: boolean;
  errorKey?: string | null;
  onConfirm: (doctorId: string, note?: string) => void;
  onDismiss: () => void;
}

/** Choose a doctor from a list, with an optional note. */
export function DoctorPickerDialog(props: Props) {
  // Re-keyed on open / close so the previous choice never survives.
  return <Body key={props.visible ? 'open' : 'closed'} {...props} />;
}

function Body({ doctors, excludeIds, withNote, onConfirm, ...rest }: Props) {
  const { t } = useTranslation('admin');
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return (
    <ConfirmDialog
      {...rest}
      confirmDisabled={!selected}
      onConfirm={() => selected && onConfirm(selected, note.trim() || undefined)}
    >
      <ScrollView style={styles.list}>
        <DoctorChoice
          doctors={doctors}
          selected={selected}
          onSelect={setSelected}
          excludeIds={excludeIds}
        />
      </ScrollView>
      {withNote ? (
        <TextInput
          mode="outlined"
          label={t('careTeam.note')}
          value={note}
          onChangeText={setNote}
          accessibilityLabel={t('careTeam.note')}
        />
      ) : null}
    </ConfirmDialog>
  );
}

const styles = StyleSheet.create({ list: { maxHeight: 260 } });
