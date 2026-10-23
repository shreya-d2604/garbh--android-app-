import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'GARBH',
  slug: 'garbh',
  scheme: 'garbh',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#FFF8F2',
  android: {
    package: 'com.garbh.app',
    adaptiveIcon: {
      backgroundColor: '#FFF8F2',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  ios: {
    bundleIdentifier: 'com.garbh.app',
    supportsTablet: true,
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-secure-store',
    'expo-notifications',
    'expo-document-picker',
    [
      'expo-image-picker',
      {
        photosPermission: 'GARBH needs access to your photos to attach medical reports.',
        cameraPermission: 'GARBH needs the camera to photograph medical reports.',
      },
    ],
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 200, backgroundColor: '#FFF8F2' },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  // Expo needs the EAS project id to mint push tokens. Set EXPO_PUBLIC_EAS_PROJECT_ID (see
  // docs/local-dev.md); without it push registration is skipped and the in-app inbox still works.
  extra: {
    eas: process.env.EXPO_PUBLIC_EAS_PROJECT_ID
      ? { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID }
      : {},
  },
};

export default config;
