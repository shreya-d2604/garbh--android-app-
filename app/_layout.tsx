import '@/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorState, paperTheme } from '@/components';
import { gateState, resolveRedirect } from '@/features/auth/gate';
import { refreshProfile, useSessionBootstrap } from '@/features/auth/session-bootstrap';
import { queryClient } from '@/lib/query-client';
import { useSession } from '@/lib/session';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <RoleRouter />
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

/** Session gate + role redirect (PLAN.md §7.1). Rules live in src/features/auth/gate.ts. */
function RoleRouter() {
  useSessionBootstrap();
  const router = useRouter();
  const segments = useSegments();
  const status = useSession((s) => s.status);
  const profile = useSession((s) => s.profile);
  const profileError = useSession((s) => s.profileError);
  const nextPath = useSession((s) => s.nextPath);
  const state = gateState({ status, profile, profileError });

  useEffect(() => {
    const target = resolveRedirect(state, segments, nextPath);
    if (target) {
      if (nextPath) useSession.setState({ nextPath: null });
      router.replace(target as never);
    }
    // `state` is derived from the store values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, profile, profileError, nextPath, segments, router]);

  if (state.kind === 'error') {
    return <ErrorState onRetry={() => void refreshProfile()} />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
