import { useEffect } from 'react';

import { queryClient } from '@/lib/query-client';
import { initialSessionState, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/** Loads the caller's profile into the session store. Call after onboarding/consent RPCs. */
export async function refreshProfile(): Promise<void> {
  const session = useSession.getState().session;
  if (!session) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !data) {
    useSession.setState({ profileError: true });
    return;
  }
  if (!data.is_active || data.deleted_at) {
    // PLAN.md §7.1: deactivated users are signed out and told to contact the hospital.
    useSession.setState({ profile: data, deactivatedNotice: true });
    await signOut();
    useSession.setState({ deactivatedNotice: true });
    return;
  }
  useSession.setState({ profile: data, profileError: false });
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  queryClient.clear();
  useSession.setState({ ...initialSessionState, status: 'signedOut' });
}

/** Subscribes the session store to Supabase auth. Mount once, in the root layout. */
export function useSessionBootstrap(): void {
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        useSession.setState({
          status: 'signedOut',
          session: null,
          profile: null,
          profileError: false,
        });
        return;
      }
      const previous = useSession.getState().session;
      useSession.setState({ status: 'signedIn', session });
      // Token refreshes don't change the user; only (re)load the profile when it can have changed.
      if (event !== 'TOKEN_REFRESHED' || previous?.user.id !== session.user.id) {
        // Deferred: Supabase advises against awaiting other supabase calls inside this callback.
        setTimeout(() => void refreshProfile(), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}
