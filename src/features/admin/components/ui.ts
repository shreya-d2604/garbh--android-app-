import { useEffect, useState } from 'react';

import { palette } from '@/components';

/** Header style shared by the admin stack layouts. */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: palette.cream },
  headerTitleStyle: { color: palette.maroon },
  headerTintColor: palette.maroon,
  headerShadowVisible: false,
} as const;

/** Value that follows `value` after it has been stable for `ms` (search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** expo-router params can be string | string[]; take the first. */
export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}
