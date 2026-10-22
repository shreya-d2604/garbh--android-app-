import { Avatar } from 'react-native-paper';

import { palette } from '@/components';

/** "Dr. Asha Rao" -> "AR". */
export function initials(fullName: string): string {
  const words = fullName
    .replace(/^dr\.?\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words[0]?.[0] ?? '?')
    .concat(words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '')
    .toUpperCase();
}

export function DoctorAvatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <Avatar.Text
      size={size}
      label={initials(name)}
      style={{ backgroundColor: palette.roseSoft }}
      color={palette.maroon}
    />
  );
}
