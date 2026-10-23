// Global Jest setup. Owner: head.
// Icon fonts are native assets; render icons as plain text in tests.
jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, testID }) => createElement(Text, { testID }, name);
  return new Proxy({}, { get: () => Icon });
});

// React Native Paper loads its icons from the subpath module; its font loading does not work
// under Jest. Render the glyph name as text (tests may query icons by name).
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, testID }) => createElement(Text, { testID }, name);
  return { __esModule: true, default: Icon };
});
