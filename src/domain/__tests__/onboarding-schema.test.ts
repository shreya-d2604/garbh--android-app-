import { patientDetailsSchema, splitList, toCompleteSignupDetails } from '../schemas/onboarding';

const TODAY = '2026-10-22';
const base = {
  full_name: 'Priya Sharma',
  phone: '+91 98000 00001',
  date_kind: 'lmp' as const,
  date: '2026-08-01',
  first_pregnancy: true,
  allergies: 'Penicillin, latex',
  chronic_conditions: '',
};

describe('patientDetailsSchema', () => {
  const schema = patientDetailsSchema(TODAY);

  it('accepts a valid form', () => {
    expect(schema.safeParse(base).success).toBe(true);
  });

  it('rejects a future LMP and a very old one', () => {
    expect(schema.safeParse({ ...base, date: '2026-10-23' }).success).toBe(false);
    expect(schema.safeParse({ ...base, date: '2025-12-01' }).success).toBe(false);
  });

  it('accepts a due date and converts it in the payload', () => {
    const form = { ...base, date_kind: 'edd' as const, date: '2027-03-01' };
    expect(schema.safeParse(form).success).toBe(true);
    expect(toCompleteSignupDetails(form)).toMatchObject({ edd_date: '2027-03-01' });
  });

  it('uses i18n keys as messages', () => {
    const r = schema.safeParse({ ...base, full_name: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('validation.required');
  });

  it('builds the complete_signup payload', () => {
    expect(toCompleteSignupDetails(base)).toEqual({
      full_name: 'Priya Sharma',
      dob: null,
      phone: '+91 98000 00001',
      lmp_date: '2026-08-01',
      gravida: 1,
      para: 0,
      abortus: 0,
      living: 0,
      allergies: ['Penicillin', 'latex'],
      chronic_conditions: [],
    });
  });

  it('splits lists', () => {
    expect(splitList(' a ,b\n\nc,')).toEqual(['a', 'b', 'c']);
  });
});
