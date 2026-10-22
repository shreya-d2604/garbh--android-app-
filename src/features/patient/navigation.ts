// Shared header look for the patient area's nested stacks (matches the tab headers).
import { palette } from '@/components';

export const stackScreenOptions = {
  headerStyle: { backgroundColor: palette.cream },
  headerTitleStyle: { color: palette.maroon },
  headerTintColor: palette.maroon,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: palette.cream },
} as const;
