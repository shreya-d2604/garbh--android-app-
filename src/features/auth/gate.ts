// Role router (PLAN.md §7.1): pure functions so the routing rules are unit-tested.
import { ROLE_SEGMENT, requiresConsent, type UserRole } from '@/domain/permissions';
import type { SessionState } from '@/lib/session';

export type GateState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'signedOut' }
  | { kind: 'needsConsent' }
  | { kind: 'needsOnboarding' }
  | { kind: 'ready'; role: UserRole };

export function gateState(s: Pick<SessionState, 'status' | 'profile' | 'profileError'>): GateState {
  if (s.status === 'loading') return { kind: 'loading' };
  if (s.status === 'signedOut') return { kind: 'signedOut' };
  if (s.profileError) return { kind: 'error' };
  const p = s.profile;
  // No profile yet, or a deactivated profile that is being signed out.
  if (!p || !p.is_active || p.deleted_at) return { kind: 'loading' };
  if (requiresConsent(p.role) && !p.consent_at) return { kind: 'needsConsent' };
  if (!p.role) return { kind: 'needsOnboarding' };
  return { kind: 'ready', role: p.role };
}

/** Routes every signed-in role may open in addition to its own area. */
const SHARED_SEGMENTS = ['notifications', 'profile'];

export function homePath(role: UserRole): string {
  return `/${ROLE_SEGMENT[role]}`;
}

/**
 * Where to send the user, or null to stay. `segments` = expo-router useSegments(),
 * e.g. ['(auth)', 'sign-in'] or ['doctor', 'patients'].
 */
export function resolveRedirect(
  state: GateState,
  segments: readonly string[],
  nextPath: string | null = null,
): string | null {
  const [first, second] = segments;
  switch (state.kind) {
    case 'loading':
    case 'error':
      return null;
    case 'signedOut':
      return first === '(auth)' && (second === 'sign-in' || second === 'verify-otp')
        ? null
        : '/sign-in';
    case 'needsConsent':
      return first === '(auth)' && second === 'consent' ? null : '/consent';
    case 'needsOnboarding':
      return first === '(auth)' && second === 'onboarding' ? null : '/onboarding/who-are-you';
    case 'ready': {
      const segment = ROLE_SEGMENT[state.role];
      if (first === segment || (first !== undefined && SHARED_SEGMENTS.includes(first)))
        return null;
      if (nextPath && nextPath.startsWith(`/${segment}`)) return nextPath;
      return homePath(state.role);
    }
  }
}
