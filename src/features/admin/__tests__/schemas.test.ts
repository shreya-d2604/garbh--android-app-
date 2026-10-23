import {
  newPatientSchema,
  patientSchema,
  pregnancyDatesSchema,
  pregnancyStatusSchema,
  profileSchema,
  reasonSchema,
  staffCreateSchema,
  toCreatePatientDetails,
  toPatientUpdate,
  toPregnancyStatusUpdate,
  toStaffPayload,
} from '../schemas';

const TODAY = '2026-10-22';

describe('staffCreateSchema', () => {
  const valid = { email: ' New.Doc@Example.com ', full_name: ' Dr. New ', role: 'doctor' as const };

  it('normalises the email and trims the name', () => {
    const r = staffCreateSchema.safeParse(valid);
    expect(r.success && r.data.email).toBe('new.doc@example.com');
    expect(r.success && r.data.full_name).toBe('Dr. New');
  });

  it('rejects a bad email, a short name, a patient role and a bad phone', () => {
    expect(staffCreateSchema.safeParse({ ...valid, email: 'nope' }).success).toBe(false);
    expect(staffCreateSchema.safeParse({ ...valid, full_name: 'A' }).success).toBe(false);
    expect(staffCreateSchema.safeParse({ ...valid, role: 'patient' }).success).toBe(false);
    expect(staffCreateSchema.safeParse({ ...valid, phone: 'abc' }).success).toBe(false);
    expect(staffCreateSchema.safeParse({ ...valid, phone: '+91 98000 00000' }).success).toBe(true);
  });

  it('turns blank optional fields into null for the function body', () => {
    expect(
      toStaffPayload({ full_name: ' Dr. New ', phone: '', designation: ' Consultant ', bio: '' }),
    ).toEqual({
      full_name: 'Dr. New',
      phone: null,
      designation: 'Consultant',
      specialization: null,
      registration_no: null,
      bio: null,
    });
  });
});

describe('patient schemas', () => {
  const base = { full_name: 'Priya Sharma', mrn: 'GH-0001', rh_negative: false };

  it('requires a name and an MRN, validates dob, email and blood group', () => {
    expect(patientSchema.safeParse(base).success).toBe(true);
    expect(patientSchema.safeParse({ ...base, mrn: ' ' }).success).toBe(false);
    expect(patientSchema.safeParse({ ...base, dob: '1996-13-40' }).success).toBe(false);
    expect(patientSchema.safeParse({ ...base, email: 'x' }).success).toBe(false);
    expect(patientSchema.safeParse({ ...base, email: '' }).success).toBe(true);
    expect(patientSchema.safeParse({ ...base, blood_group: 'Z+' }).success).toBe(false);
    expect(patientSchema.safeParse({ ...base, blood_group: 'AB-' }).success).toBe(true);
  });

  it('builds the update row: lists split, blanks become null', () => {
    expect(
      toPatientUpdate({
        ...base,
        email: 'PRIYA@X.TEST',
        allergies: 'Penicillin, Latex',
        chronic_conditions: '',
        phone: '',
        blood_group: '',
        rh_negative: true,
      }),
    ).toMatchObject({
      email: 'priya@x.test',
      allergies: ['Penicillin', 'Latex'],
      chronic_conditions: [],
      phone: null,
      blood_group: null,
      rh_negative: true,
    });
  });

  it('a new patient: LMP must be recent, and a primary doctor needs an LMP', () => {
    const schema = newPatientSchema(TODAY);
    expect(schema.safeParse({ ...base, lmp_date: '2026-08-01' }).success).toBe(true);
    expect(schema.safeParse({ ...base, lmp_date: '2026-11-01' }).success).toBe(false); // future
    expect(schema.safeParse({ ...base, lmp_date: '2025-01-01' }).success).toBe(false); // > 300 days
    expect(schema.safeParse({ ...base, primary_doctor: 'doc-1' }).success).toBe(false);
    expect(
      schema.safeParse({ ...base, lmp_date: '2026-08-01', primary_doctor: 'doc-1' }).success,
    ).toBe(true);
  });

  it('create details null out blanks', () => {
    expect(
      toCreatePatientDetails({ ...base, phone: '', lmp_date: '2026-08-01', primary_doctor: 'd' }),
    ).toEqual({
      full_name: 'Priya Sharma',
      mrn: 'GH-0001',
      dob: null,
      phone: null,
      email: null,
      address: null,
      blood_group: null,
      lmp_date: '2026-08-01',
      primary_doctor: 'd',
    });
  });
});

describe('pregnancyDatesSchema', () => {
  const schema = pregnancyDatesSchema(TODAY, true);
  const reason = 'Entered the wrong month';

  it('needs a reason and at least one date', () => {
    expect(schema.safeParse({ lmp_date: '2026-08-01', reason: '' }).success).toBe(false);
    expect(schema.safeParse({ lmp_date: '', edd_usg: '', reason }).success).toBe(false);
    expect(schema.safeParse({ lmp_date: '2026-08-01', reason }).success).toBe(true);
    expect(schema.safeParse({ edd_usg: '2027-02-01', reason }).success).toBe(true);
  });

  it('keeps an active pregnancy plausible (same limits as the SQL function)', () => {
    expect(schema.safeParse({ lmp_date: '2026-11-05', reason }).success).toBe(false); // future
    expect(schema.safeParse({ lmp_date: '2025-06-01', reason }).success).toBe(false); // too old
    expect(schema.safeParse({ edd_usg: '2026-10-01', reason }).success).toBe(false); // > 14 days ago
    expect(schema.safeParse({ edd_usg: '2027-09-01', reason }).success).toBe(false); // > 294 days ahead
  });

  it('allows an old LMP on a closed pregnancy', () => {
    expect(
      pregnancyDatesSchema(TODAY, false).safeParse({ lmp_date: '2025-06-01', reason }).success,
    ).toBe(true);
  });
});

describe('other forms', () => {
  it('reason needs the minimum length', () => {
    expect(reasonSchema(5).safeParse({ reason: 'abcd' }).success).toBe(false);
    expect(reasonSchema(5).safeParse({ reason: ' abcde ' }).success).toBe(true);
  });

  it('pregnancy status: only a closed pregnancy keeps outcome fields', () => {
    const active = toPregnancyStatusUpdate({
      risk_level: 'high',
      risk_factors: 'GDM, Age > 35',
      status: 'active',
      outcome_date: '2026-10-01',
      outcome_notes: 'x',
    });
    expect(active).toMatchObject({
      risk_factors: ['GDM', 'Age > 35'],
      outcome_date: null,
      outcome_notes: null,
    });
    const delivered = toPregnancyStatusUpdate({
      risk_level: 'low',
      status: 'delivered',
      outcome_date: '2026-10-01',
      outcome_notes: ' healthy ',
    });
    expect(delivered).toMatchObject({ outcome_date: '2026-10-01', outcome_notes: 'healthy' });
    expect(pregnancyStatusSchema.safeParse({ risk_level: 'low', status: 'gone' }).success).toBe(
      false,
    );
  });

  it('profile: name required, phone optional but valid', () => {
    expect(profileSchema.safeParse({ full_name: 'A' }).success).toBe(false);
    expect(profileSchema.safeParse({ full_name: 'Asha', phone: '' }).success).toBe(true);
    expect(profileSchema.safeParse({ full_name: 'Asha', phone: '12' }).success).toBe(false);
  });
});
