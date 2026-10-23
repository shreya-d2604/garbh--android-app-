import {
  DEFAULT_PERMISSIONS,
  enabledPermissions,
  PERMISSION_KEYS,
  permissionsFromLink,
  permissionsPayload,
  samePermissions,
} from '../permissions';

const link = {
  can_view_appointments: true,
  can_view_journey: false,
  can_view_summaries: true,
  can_view_reports: false,
  can_view_prescriptions: true,
  receive_notifications: false,
};

describe('companion permission toggles', () => {
  it('reads the toggles from a link row', () => {
    expect(permissionsFromLink(link)).toEqual({
      appointments: true,
      journey: false,
      summaries: true,
      reports: false,
      prescriptions: true,
      notifications: false,
    });
  });

  it('sends every key explicitly (the RPC treats missing keys as false)', () => {
    const payload = permissionsPayload(DEFAULT_PERMISSIONS);
    expect(Object.keys(payload).sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(Object.values(payload).every((v) => typeof v === 'boolean')).toBe(true);
  });

  it('defaults keep reports and prescriptions off', () => {
    expect(DEFAULT_PERMISSIONS.reports).toBe(false);
    expect(DEFAULT_PERMISSIONS.prescriptions).toBe(false);
    expect(DEFAULT_PERMISSIONS.appointments).toBe(true);
  });

  it('compares states and lists the enabled ones in display order', () => {
    const a = permissionsFromLink(link);
    expect(samePermissions(a, { ...a })).toBe(true);
    expect(samePermissions(a, { ...a, journey: true })).toBe(false);
    expect(enabledPermissions(a)).toEqual(['appointments', 'summaries', 'prescriptions']);
  });
});
