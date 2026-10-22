import { internalRoute, notificationIcon, relativeTime } from '../format';

describe('internalRoute', () => {
  it('accepts in-app paths', () => {
    expect(internalRoute({ route: '/patient/appointments/abc' })).toBe('/patient/appointments/abc');
    expect(internalRoute({ route: '/patient/appointments/book?visit=1' })).toBe(
      '/patient/appointments/book?visit=1',
    );
  });

  it.each([
    ['external URL', { route: 'https://evil.test/x' }],
    ['scheme-relative URL', { route: '//evil.test/x' }],
    ['embedded scheme', { route: '/redirect?to=https://evil.test' }],
    ['relative path', { route: 'patient' }],
    ['non-string', { route: 42 }],
    ['missing route', {}],
    ['null data', null],
    ['non-object data', 'x'],
  ])('rejects %s', (_name, data) => {
    expect(internalRoute(data)).toBeNull();
  });
});

describe('notificationIcon', () => {
  it('has an icon for every notification type of the catalogue', () => {
    const types = [
      'appointment_booked',
      'appointment_changed',
      'appointment_cancelled',
      'appointment_reminder',
      'consultation_published',
      'summary_published',
      'report_added',
      'account_verified',
      'visit_due',
      'companion_request',
      'companion_approved',
      'companion_revoked',
      'week_update',
      'trimester_change',
      'ai_draft_ready',
      'patient_checked_in',
      'care_team_changed',
      'data_quality',
    ];
    for (const t of types) expect(notificationIcon(t)).not.toBe('bell-outline');
  });

  it('falls back to a bell for unknown types', () => {
    expect(notificationIcon('something_new')).toBe('bell-outline');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  it('reads naturally', () => {
    expect(relativeTime('2026-10-23T11:55:00Z', now)).toBe('5 minutes ago');
    expect(relativeTime('2026-10-23T09:00:00Z', now)).toBe('about 3 hours ago');
    expect(relativeTime('2026-10-21T12:00:00Z', now)).toBe('2 days ago');
  });
});
