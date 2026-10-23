import {
  patientDetailsEditSchema,
  registerPatientSchema,
  toRegisterDetails,
  type RegisterPatientForm,
} from '../schemas';

const TODAY = '2030-03-10';
const valid: RegisterPatientForm = {
  full_name: 'Asha Patil',
  phone: '+91 98000 12345',
  email: 'Asha@Example.com',
  dob: '1995-05-05',
  address: '',
  mrn: '',
  blood_group: 'O-',
  allergies: 'Latex, Dust',
  chronic_conditions: '',
  emergency_contact: '',
  date_kind: 'lmp',
  date: '2030-01-01',
  first_pregnancy: true,
  primary_doctor: 'doc-1',
  consent: true,
};

const messages = (v: Partial<RegisterPatientForm>) => {
  const r = registerPatientSchema(TODAY).safeParse({ ...valid, ...v });
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}:${i.message}`);
};

describe('registerPatientSchema', () => {
  it('accepts a complete form and lower-cases the email', () => {
    const r = registerPatientSchema(TODAY).safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('asha@example.com');
  });

  it('requires name, phone, doctor and consent', () => {
    expect(messages({ full_name: 'A' })).toContain('full_name:validation.required');
    expect(messages({ phone: '123' })).toContain('phone:validation.phone');
    expect(messages({ primary_doctor: '' })).toContain(
      'primary_doctor:reception:validation.doctor',
    );
    expect(messages({ consent: false })).toContain('consent:reception:validation.consent');
  });

  it('allows an empty email, MRN and blood group but rejects malformed ones', () => {
    expect(messages({ email: '', mrn: '', blood_group: '' })).toEqual([]);
    expect(messages({ email: 'nope' })).toContain('email:validation.email');
    expect(messages({ mrn: 'a b' })).toContain('mrn:reception:validation.mrn');
    expect(messages({ blood_group: 'Z+' as never }).length).toBeGreaterThan(0);
  });

  it('checks the pregnancy date like the server (last 300 days, not in the future)', () => {
    expect(messages({ date: '2030-03-11' })).toContain('date:validation.pregnancyDate');
    expect(messages({ date: '2029-05-01' })).toContain('date:validation.pregnancyDate');
    expect(messages({ date_kind: 'edd', date: '2030-10-01' })).toEqual([]);
    expect(messages({ date_kind: 'edd', date: '2031-02-01' })).toContain(
      'date:validation.pregnancyDate',
    );
    expect(messages({ date: 'not-a-date' })).toContain('date:validation.date');
  });
});

describe('toRegisterDetails', () => {
  it('builds the register_patient payload, omitting blanks', () => {
    const d = toRegisterDetails({ ...valid, email: 'asha@example.com' });
    expect(d).toMatchObject({
      full_name: 'Asha Patil',
      phone: '+91 98000 12345',
      email: 'asha@example.com',
      dob: '1995-05-05',
      blood_group: 'O-',
      allergies: ['Latex', 'Dust'],
      chronic_conditions: [],
      lmp_date: '2030-01-01',
      gravida: 1,
      primary_doctor: 'doc-1',
      consent: true,
    });
    expect(d.mrn).toBeUndefined();
    expect(d.address).toBeUndefined();
    expect('edd_date' in d).toBe(false);
  });

  it('sends an EDD instead of an LMP when chosen, and no obstetric counts for repeat pregnancies', () => {
    const d = toRegisterDetails({
      ...valid,
      date_kind: 'edd',
      date: '2030-10-01',
      first_pregnancy: false,
      mrn: ' GH-0042 ',
    });
    expect(d).toMatchObject({ edd_date: '2030-10-01', mrn: 'GH-0042' });
    expect('lmp_date' in d).toBe(false);
    expect('gravida' in d).toBe(false);
  });
});

describe('patientDetailsEditSchema', () => {
  it('allows blank optional fields', () => {
    expect(
      patientDetailsEditSchema.safeParse({
        full_name: 'Asha Patil',
        phone: '',
        email: '',
        dob: '',
        address: '',
      }).success,
    ).toBe(true);
  });
  it('rejects a bad phone', () => {
    expect(
      patientDetailsEditSchema.safeParse({ full_name: 'Asha Patil', phone: '12' }).success,
    ).toBe(false);
  });
});
