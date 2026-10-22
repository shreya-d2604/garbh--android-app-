// Staff list filtering (Admin > Users). Pure and unit-tested.
export type StaffRole = 'admin' | 'doctor' | 'receptionist';
export const STAFF_ROLES: readonly StaffRole[] = ['doctor', 'receptionist', 'admin'];

export interface StaffRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: StaffRole;
  is_active: boolean;
}

export interface StaffFilter {
  search: string;
  role: StaffRole | 'all';
  showInactive: boolean;
}

export const defaultStaffFilter: StaffFilter = { search: '', role: 'all', showInactive: false };

export function filterStaff<T extends StaffRow>(rows: readonly T[], f: StaffFilter): T[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (!f.showInactive && !r.is_active) return false;
    if (f.role !== 'all' && r.role !== f.role) return false;
    if (!q) return true;
    return (
      (r.full_name ?? '').toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q)
    );
  });
}
