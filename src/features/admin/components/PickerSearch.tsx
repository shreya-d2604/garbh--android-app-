import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import { ListItem, palette, spacing } from '@/components';

import { SearchField } from './SearchField';
import { useDebounced } from './ui';

export interface PickItem {
  id: string;
  label: string;
  description?: string;
}

interface Props {
  placeholder: string;
  selected: PickItem | null;
  onSelect: (item: PickItem | null) => void;
  /** Run the search for a (debounced) term; results are shown under the box. */
  useResults: (term: string) => { data: PickItem[] | undefined; isFetching: boolean };
}

/** Search box that picks ONE item (a person or a patient) for a filter. */
export function PickerSearch({ placeholder, selected, onSelect, useResults }: Props) {
  const [text, setText] = useState('');
  const term = useDebounced(text);
  const results = useResults(term);

  if (selected) {
    return (
      <View style={styles.row}>
        <Chip
          icon="account"
          onClose={() => onSelect(null)}
          closeIconAccessibilityLabel={placeholder}
        >
          {selected.label}
        </Chip>
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <SearchField value={text} onChangeText={setText} placeholder={placeholder} />
      {(results.data ?? []).map((item) => (
        <ListItem
          key={item.id}
          title={item.label}
          description={item.description}
          onPress={() => {
            onSelect(item);
            setText('');
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.xs, backgroundColor: palette.cream },
  row: { flexDirection: 'row' },
});
