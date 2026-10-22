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
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 200, backgroundColor: '#FFF8F2' },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
};

export default config;
