import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderActions, palette } from '@/components';

// Placeholder tab layout. Owner after the foundation: the patient agent (see AGENTS.md).
export default function PatientLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.cream },
        headerTitleStyle: { color: palette.maroon },
        headerShadowVisible: false,
        headerRight: () => <HeaderActions />,
        tabBarActiveTintColor: palette.rose,
        tabBarStyle: { backgroundColor: palette.white },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('shell.home'),
          tabBarIcon: ({ focused, size }) => (
            <MaterialCommunityIcons
              name="human-pregnant"
              color={focused ? palette.rose : palette.inkMuted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen name="first-booking" options={{ href: null, title: t('shell.home') }} />
    </Tabs>
  );
}
