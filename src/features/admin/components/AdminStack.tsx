import { Stack } from 'expo-router';

import { HeaderActions } from '@/components';

import { stackScreenOptions } from './ui';

/** Stack used by every admin tab folder (users, patients, data-quality, more). */
export function AdminStack() {
  return <Stack screenOptions={{ ...stackScreenOptions, headerRight: () => <HeaderActions /> }} />;
}
