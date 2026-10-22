// Global Jest setup. Owner: head.
// Icon fonts are native assets; render icons as plain text in tests.
jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, testID }) => createElement(Text, { testID }, name);
  return new Proxy({}, { get: () => Icon });
});
