import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState, HeaderActions, LoadingState, palette } from '@/components';
import { companionCanView } from '@/domain/permissions';
import { useCompanionLinks } from '@/features/companion/hooks';
import { useCompanionSelection } from '@/features/companion/store';
import { useRealtimeInvalidate } from '@/lib/realtime';

// A deep link straight to a section (notifications) still gets the home screen underneath.
export const unstable_settings = { initialRouteName: 'index' };

/**
 * Read-only views of ONE followed patient. If the link stops being approved while the companion
 * is here (the patient revoked it), the live link query flips and she is sent back out at once.
 */
export default function PatientSectionsLayout() {
  const { t } = useTranslation('companion');
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const links = useCompanionLinks();
  const select = useCompanionSelection((s) => s.select);

  const link =
    links.data?.find((l) => l.patient_id === patientId && l.status === 'approved') ?? null;
  const linkId = link?.id;

  useEffect(() => {
    if (linkId) select(patientId);
  }, [linkId, patientId, select]);

  // Appointment changes show up live (PLAN.md §8.5), only for companions allowed to see them.
  useRealtimeInvalidate({
    table: 'appointments',
    filter: `patient_id=eq.${patientId}`,
    queryKey: ['companion', patientId, 'appointments'],
    enabled: companionCanView(link, 'appointments'),
  });

  if (links.isPending) return <LoadingState />;
  if (links.isError) return <ErrorState onRetry={() => void links.refetch()} />;
  if (!link) return <Redirect href="/companion" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.cream },
        headerTitleStyle: { color: palette.maroon },
        headerTintColor: palette.maroon,
        headerShadowVisible: false,
        headerRight: () => <HeaderActions />,
      }}
    >
      <Stack.Screen name="index" options={{ title: link.patient_name ?? t('home.title') }} />
      <Stack.Screen name="journey" options={{ title: t('sections.journey') }} />
      <Stack.Screen name="appointments" options={{ title: t('sections.appointments') }} />
      <Stack.Screen name="summaries" options={{ title: t('sections.summaries') }} />
      <Stack.Screen name="reports" options={{ title: t('sections.reports') }} />
      <Stack.Screen name="prescriptions" options={{ title: t('sections.prescriptions') }} />
    </Stack>
  );
}
