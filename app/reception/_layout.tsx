import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { HeaderActions, palette } from '@/components';
import { receptionKey, useVerifyQueue } from '@/features/reception/hooks';
import { useRealtimeInvalidate } from '@/lib/realtime';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function TabIcon({ name, focused, size }: { name: IconName; focused: boolean; size: number }) {
  return (
    <MaterialCommunityIcons
      name={name}
      color={focused ? palette.rose : palette.inkMuted}
      size={size}
    />
  );
}
const icon = (name: IconName) =>
  function ReceptionTabIcon({ focused, size }: { focused: boolean; size: number }) {
    return <TabIcon name={name} focused={focused} size={size} />;
  };

// Front desk (PLAN.md §7.5). Tabs: Today, Calendar, Register, Verify, Visits due. The other screens
// are pushed on top of the tabs and hidden from the tab bar (href: null).
export default function ReceptionLayout() {
  const { t } = useTranslation('reception');
  // Online bookings, changes and cancellations show up live on every reception screen (PLAN.md §8.5).
  useRealtimeInvalidate({ table: 'appointments', queryKey: receptionKey });
  const queue = useVerifyQueue();
  const waiting = queue.data?.length ?? 0;

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
      <Tabs.Screen name="index" options={{ title: t('tabs.today'), tabBarIcon: icon('desk') }} />
      <Tabs.Screen
        name="calendar"
        options={{ title: t('tabs.calendar'), tabBarIcon: icon('calendar-month-outline') }}
      />
      <Tabs.Screen
        name="register"
        options={{ title: t('tabs.register'), tabBarIcon: icon('account-plus-outline') }}
      />
      <Tabs.Screen
        name="verify"
        options={{
          title: t('tabs.verify'),
          tabBarIcon: icon('shield-check-outline'),
          tabBarBadge: waiting > 0 ? waiting : undefined,
        }}
      />
      <Tabs.Screen
        name="visits"
        options={{ title: t('tabs.visits'), tabBarIcon: icon('clipboard-list-outline') }}
      />
      <Tabs.Screen name="book" options={{ title: t('book.title'), href: null }} />
      <Tabs.Screen name="appointment" options={{ title: t('appointment.title'), href: null }} />
      <Tabs.Screen
        name="verify-patient"
        options={{ title: t('verifyPatient.title'), href: null }}
      />
      <Tabs.Screen name="unavailable" options={{ title: t('unavailable.title'), href: null }} />
    </Tabs>
  );
}
