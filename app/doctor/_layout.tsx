import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { HeaderActions, palette } from '@/components';
import { useDraftCount } from '@/features/doctor/hooks';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const icon =
  (name: IconName) =>
  ({ focused, size }: { focused: boolean; size: number }) => (
    <MaterialCommunityIcons name={name} color={focused ? palette.rose : palette.inkMuted} size={size} />
  );

/** Doctor area: Today, Patients, AI inbox (live badge) and Schedule; detail screens are hidden tabs. */
export default function DoctorLayout() {
  const { t } = useTranslation('doctor');
  const drafts = useDraftCount().data ?? 0;
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
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="today" options={{ title: t('tabs.today'), tabBarIcon: icon('calendar-today') }} />
      <Tabs.Screen name="patients" options={{ title: t('tabs.patients'), tabBarIcon: icon('account-group-outline') }} />
      <Tabs.Screen
        name="ai-inbox"
        options={{
          title: t('tabs.aiInbox'),
          headerShown: false,
          tabBarIcon: icon('creation-outline'),
          tabBarBadge: drafts > 0 ? drafts : undefined,
          tabBarBadgeStyle: { backgroundColor: palette.rose },
        }}
      />
      <Tabs.Screen name="schedule" options={{ title: t('tabs.schedule'), tabBarIcon: icon('calendar-clock') }} />
      <Tabs.Screen name="patient" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="consult" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
