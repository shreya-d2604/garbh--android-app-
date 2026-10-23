import { usePreventScreenCapture } from 'expo-screen-capture';

/** Blocks screenshots and the recent-apps preview on screens that show patient data (PLAN.md §12). */
export function useSecureScreen(key: string): void {
  usePreventScreenCapture(key);
}
