import { companionCanView, isStaffRole, requiresConsent, ROLE_SEGMENT } from '../permissions';

const link = {
  status: 'approved' as const,
  can_view_appointments: true,
  can_view_journey: false,
  can_view_summaries: true,
  can_view_reports: false,
  can_view_prescriptions: false,
};

describe('permissions', () => {
  it('identifies staff roles', () => {
    expect(isStaffRole('doctor')).toBe(true);
    expect(isStaffRole('patient')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });

  it('requires consent for patients, companions and new users only', () => {
    expect(requiresConsent(null)).toBe(true);
    expect(requiresConsent('companion')).toBe(true);
    expect(requiresConsent('receptionist')).toBe(false);
  });

  it('maps roles to their route segment', () => {
    expect(ROLE_SEGMENT.receptionist).toBe('reception');
  });

  it('hides companion sections unless approved and permitted', () => {
    expect(companionCanView(link, 'appointments')).toBe(true);
    expect(companionCanView(link, 'journey')).toBe(false);
    expect(companionCanView({ ...link, status: 'pending' }, 'appointments')).toBe(false);
    expect(companionCanView({ ...link, status: 'revoked' }, 'summaries')).toBe(false);
    expect(companionCanView(null, 'summaries')).toBe(false);
  });
});
