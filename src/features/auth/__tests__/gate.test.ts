import type { Profile } from '@/lib/session';

import { gateState, resolveRedirect, type GateState } from '../gate';

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'u1',
  role: null,
  full_name: 'Test',
  email: 't@x.test',
  phone: null,
  avatar_path: null,
  is_active: true,
  consent_at: '2026-10-01T00:00:00Z',
  created_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
  ...over,
});

const signedIn = (p: Profile | null) =>
  gateState({ status: 'signedIn', profile: p, profileError: false });

describe('gateState', () => {
  it('waits while loading or before the profile arrives', () => {
    expect(gateState({ status: 'loading', profile: null, profileError: false }).kind).toBe(
      'loading',
    );
    expect(signedIn(null).kind).toBe('loading');
  });

  it('asks patients/companions/new users for consent, not staff', () => {
    expect(signedIn(profile({ consent_at: null })).kind).toBe('needsConsent');
    expect(signedIn(profile({ role: 'patient', consent_at: null })).kind).toBe('needsConsent');
    expect(signedIn(profile({ role: 'doctor', consent_at: null }))).toEqual({
      kind: 'ready',
      role: 'doctor',
    });
  });

  it('sends role-less users to onboarding', () => {
    expect(signedIn(profile()).kind).toBe('needsOnboarding');
  });

  it('treats deactivated users as loading (they are being signed out)', () => {
    expect(signedIn(profile({ role: 'doctor', is_active: false })).kind).toBe('loading');
  });

  it('surfaces profile errors', () => {
    expect(gateState({ status: 'signedIn', profile: null, profileError: true }).kind).toBe('error');
  });
});

describe('resolveRedirect', () => {
  const ready = (role: Extract<GateState, { kind: 'ready' }>['role']): GateState => ({
    kind: 'ready',
    role,
  });

  it('keeps signed-out users on sign-in / verify', () => {
    expect(resolveRedirect({ kind: 'signedOut' }, ['(auth)', 'sign-in'])).toBeNull();
    expect(resolveRedirect({ kind: 'signedOut' }, ['(auth)', 'verify-otp'])).toBeNull();
    expect(resolveRedirect({ kind: 'signedOut' }, ['doctor'])).toBe('/sign-in');
    expect(resolveRedirect({ kind: 'signedOut' }, [])).toBe('/sign-in');
  });

  it('routes consent and onboarding', () => {
    expect(resolveRedirect({ kind: 'needsConsent' }, ['(auth)', 'sign-in'])).toBe('/consent');
    expect(resolveRedirect({ kind: 'needsOnboarding' }, ['(auth)', 'consent'])).toBe(
      '/onboarding/who-are-you',
    );
    expect(
      resolveRedirect({ kind: 'needsOnboarding' }, ['(auth)', 'onboarding', 'patient-details']),
    ).toBeNull();
  });

  it.each([
    ['patient', '/patient'],
    ['companion', '/companion'],
    ['doctor', '/doctor'],
    ['receptionist', '/reception'],
    ['admin', '/admin'],
  ] as const)('sends %s home to %s', (role, path) => {
    expect(resolveRedirect(ready(role), ['(auth)', 'verify-otp'])).toBe(path);
  });

  it('keeps users inside their own area and shared routes only', () => {
    expect(resolveRedirect(ready('doctor'), ['doctor', 'patients'])).toBeNull();
    expect(resolveRedirect(ready('doctor'), ['notifications'])).toBeNull();
    expect(resolveRedirect(ready('doctor'), ['profile'])).toBeNull();
    expect(resolveRedirect(ready('receptionist'), ['doctor'])).toBe('/reception');
    expect(resolveRedirect(ready('patient'), ['admin', 'users'])).toBe('/patient');
  });

  it('honours a one-shot nextPath inside the role area only', () => {
    expect(
      resolveRedirect(ready('patient'), ['(auth)', 'onboarding'], '/patient/first-booking'),
    ).toBe('/patient/first-booking');
    expect(resolveRedirect(ready('patient'), ['(auth)'], '/admin')).toBe('/patient');
  });
});
