import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { HeaderActions, palette } from '@/components';
import { usePatientRealtime } from '@/features/patient/hooks';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function tabIcon(name: IconName) {
  return function TabBarIcon({ focused, size }: { focused: boolean; size: number }) {
    return (
      <MaterialCommunityIcons
        name={name}
        color={focused ? palette.rose : palette.inkMuted}
        size={size}
      />
    );
  };
}

// Patient area (PLAN.md §7.2): five tabs. Appointments, Reports and More hold their own
// stacks (with their own headers); the other routes in this folder are reached from them.
export default function PatientLayout() {
  const { t } = useTranslation('patient');
  // Live appointment updates for every patient screen (PLAN.md §8.5).
  usePatientRealtime();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerStyle: { backgroundColor: palette.cream },
        headerTitleStyle: { color: palette.maroon },
        headerShadowVisible: false,
        headerRight: () => <HeaderActions />,
        tabBarActiveTintColor: palette.rose,
        tabBarStyle: { backgroundColor: palette.white },
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home-heart') }}
      />
      <Tabs.Screen
        name="journey"
        options={{ title: t('tabs.journey'), tabBarIcon: tabIcon('map-marker-path') }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: t('tabs.appointments'),
          headerShown: false,
          tabBarIcon: tabIcon('calendar-heart'),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('tabs.reports'),
          headerShown: false,
          tabBarIcon: tabIcon('file-document-outline'),
        }}
      />
      <Tabs.Screen
        name="(more)"
        options={{
          title: t('tabs.more'),
          headerShown: false,
          tabBarIcon: tabIcon('dots-horizontal-circle-outline'),
        }}
      />
      {/* Reached from onboarding, Home and More; not tabs. */}
      <Tabs.Screen name="first-booking" options={{ href: null, title: t('titles.firstBooking') }} />
      {/* Owned by the companion agent: has its own Stack layout (docs/briefs/companion.md). */}
      <Tabs.Screen name="companions" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
