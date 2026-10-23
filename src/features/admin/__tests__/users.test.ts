import { defaultStaffFilter, filterStaff, type StaffRow } from '../users';

const rows: StaffRow[] = [
  {
    id: '1',
    full_name: 'Dr. Asha Rao',
    email: 'dr.asha@garbh.test',
    role: 'doctor',
    is_active: true,
  },
  {
    id: '2',
    full_name: 'Ritu Desk',
    email: 'reception@garbh.test',
    role: 'receptionist',
    is_active: true,
  },
  {
    id: '3',
    full_name: 'Dr. Vikram Joshi',
    email: 'dr.vikram@garbh.test',
    role: 'doctor',
    is_active: false,
  },
  { id: '4', full_name: null, email: 'admin@garbh.test', role: 'admin', is_active: true },
];

describe('filterStaff', () => {
  it('hides deactivated accounts by default', () => {
    expect(filterStaff(rows, defaultStaffFilter).map((r) => r.id)).toEqual(['1', '2', '4']);
  });

  it('shows deactivated accounts on request', () => {
    expect(filterStaff(rows, { ...defaultStaffFilter, showInactive: true })).toHaveLength(4);
  });

  it('filters by role', () => {
    expect(
      filterStaff(rows, { ...defaultStaffFilter, role: 'doctor', showInactive: true }).map(
        (r) => r.id,
      ),
    ).toEqual(['1', '3']);
  });

  it('searches name and email, ignoring case and spaces around', () => {
    expect(filterStaff(rows, { ...defaultStaffFilter, search: ' ASHA ' }).map((r) => r.id)).toEqual(
      ['1'],
    );
    expect(filterStaff(rows, { ...defaultStaffFilter, search: 'admin@' }).map((r) => r.id)).toEqual(
      ['4'],
    );
    expect(filterStaff(rows, { ...defaultStaffFilter, search: 'nobody' })).toEqual([]);
  });
});
