// Session store (Zustand). Holds the Supabase session and the caller's profile row.
// Populated by useSessionBootstrap() in app/_layout.tsx; read anywhere with useSession().
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import type { Database } from '@/types/database';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export interface SessionState {
  /** 'loading' until the stored session (and profile) have been read. */
  status: 'loading' | 'signedOut' | 'signedIn';
  session: Session | null;
  profile: Profile | null;
  profileError: boolean;
  /** Set when a deactivated user was signed out, so sign-in can explain why. */
  deactivatedNotice: boolean;
  /** One-shot destination after onboarding (consumed by the role router). */
  nextPath: string | null;
}

export const initialSessionState: SessionState = {
  status: 'loading',
  session: null,
  profile: null,
  profileError: false,
  deactivatedNotice: false,
  nextPath: null,
};

export const useSession = create<SessionState>(() => initialSessionState);
