import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HeaderActions, palette } from '@/components';

// Placeholder tab layout. Owner after the foundation: the doctor agent (see AGENTS.md).
export default function DoctorLayout() {
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
              name="stethoscope"
              color={focused ? palette.rose : palette.inkMuted}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
