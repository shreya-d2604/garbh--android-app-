import { StyleSheet } from 'react-native';
import { Searchbar } from 'react-native-paper';

import { palette, radius } from '@/components';

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}

export function SearchField({ value, onChangeText, placeholder }: Props) {
  return (
    <Searchbar
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      accessibilityLabel={placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      style={styles.bar}
      elevation={0}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.outline,
    borderRadius: radius.pill,
  },
});
