// GARBH design tokens + React Native Paper (MD3) theme.
// Soft rose primary, deep maroon accents, warm cream background, rounded cards.
// Use these tokens instead of hard-coded colours/spacings in feature code.
import { MD3LightTheme, type MD3Theme } from 'react-native-paper';

export const palette = {
  rose: '#B84C65', // primary actions (white text passes WCAG AA)
  roseSoft: '#F8D7DE', // containers, selected chips
  roseMist: '#FDEEF1', // subtle highlights
  maroon: '#7A1F3D', // accents, headings
  maroonSoft: '#F1D4DD',
  cream: '#FFF8F2', // app background
  white: '#FFFFFF',
  ink: '#3B2A2F', // body text
  inkMuted: '#7A666C', // secondary text
  outline: '#E7D6D9',
  success: '#2E7D5B',
  successSoft: '#DDF1E6',
  warning: '#9A5B00',
  warningSoft: '#FCEBCF',
  danger: '#B3261E',
  dangerSoft: '#F9DEDC',
  info: '#2F6690',
  infoSoft: '#DCEAF5',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 } as const;

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: palette.success, bg: palette.successSoft },
  warning: { fg: palette.warning, bg: palette.warningSoft },
  danger: { fg: palette.danger, bg: palette.dangerSoft },
  info: { fg: palette.info, bg: palette.infoSoft },
  neutral: { fg: palette.inkMuted, bg: palette.outline },
  primary: { fg: palette.maroon, bg: palette.roseSoft },
};

export const paperTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 4,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.rose,
    onPrimary: palette.white,
    primaryContainer: palette.roseSoft,
    onPrimaryContainer: palette.maroon,
    secondary: palette.maroon,
    onSecondary: palette.white,
    secondaryContainer: palette.maroonSoft,
    onSecondaryContainer: palette.maroon,
    tertiary: palette.info,
    background: palette.cream,
    onBackground: palette.ink,
    surface: palette.white,
    onSurface: palette.ink,
    surfaceVariant: palette.roseMist,
    onSurfaceVariant: palette.inkMuted,
    outline: palette.outline,
    error: palette.danger,
    errorContainer: palette.dangerSoft,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: palette.white,
      level2: palette.roseMist,
    },
  },
};
