import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { HeaderActions, palette } from '@/components';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ focused, size }: { focused: boolean; size: number }) {
    return (
      <MaterialCommunityIcons name={name} color={focused ? palette.rose : palette.inkMuted} size={size} />
    );
  };
}

/** Admin area (PLAN.md §7.6): dashboard + four tabs. Tabs with a folder host their own stack. */
export default function AdminLayout() {
  const { t } = useTranslation('admin');
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
        options={{ title: t('tabs.dashboard'), tabBarIcon: tabIcon('view-dashboard-outline') }}
      />
      <Tabs.Screen
        name="patients"
        options={{ title: t('tabs.patients'), headerShown: false, tabBarIcon: tabIcon('human-pregnant') }}
      />
      <Tabs.Screen
        name="users"
        options={{ title: t('tabs.users'), headerShown: false, tabBarIcon: tabIcon('account-group-outline') }}
      />
      <Tabs.Screen
        name="data-quality"
        options={{
          title: t('tabs.quality'),
          headerShown: false,
          tabBarIcon: tabIcon('shield-check-outline'),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('tabs.more'), headerShown: false, tabBarIcon: tabIcon('dots-horizontal') }}
      />
    </Tabs>
  );
}
