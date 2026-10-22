// Jest mock for Paper's icon font: renders the glyph name as text.
// Use: jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => jest.requireActual('../test-icon-mock'));
import { Text } from 'react-native';

export default function IconMock({ name }: { name: string }) {
  return <Text>{name}</Text>;
}
