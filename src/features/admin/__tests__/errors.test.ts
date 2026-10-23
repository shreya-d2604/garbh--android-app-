import { adminErrorKey } from '../errors';

describe('adminErrorKey', () => {
  it('prefixes the shared RPC error keys with the common namespace', () => {
    expect(adminErrorKey({ message: 'NOT_ALLOWED' })).toBe('common:errors.NOT_ALLOWED');
    expect(adminErrorKey({ message: 'INVALID_INPUT' })).toBe('common:errors.INVALID_INPUT');
    expect(adminErrorKey({ message: 'weird' })).toBe('common:errors.GENERIC');
    expect(adminErrorKey(null)).toBe('common:errors.GENERIC');
  });

  it('maps unique violations to a duplicate message, and MRN clashes to MRN_TAKEN', () => {
    expect(
      adminErrorKey({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "visit_templates_schedule_seq_key"',
      }),
    ).toBe('admin:errors.DUPLICATE');
    expect(
      adminErrorKey({
        code: '23505',
        message: 'duplicate key value violates unique constraint "patients_mrn_key"',
      }),
    ).toBe('common:errors.MRN_TAKEN');
  });

  it('knows the second active pregnancy and a failed invite email', () => {
    expect(
      adminErrorKey({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "pregnancies_one_active_per_patient"',
      }),
    ).toBe('admin:errors.ACTIVE_PREGNANCY');
    expect(adminErrorKey({ message: 'INVITE_FAILED' })).toBe('admin:users.inviteFailed');
  });

  it('maps rows still in use and Edge Function codes', () => {
    expect(adminErrorKey({ code: '23503' })).toBe('admin:errors.IN_USE');
    expect(adminErrorKey({ message: 'EMAIL_TAKEN' })).toBe('admin:errors.EMAIL_TAKEN');
  });
});
