// Care team panel (PLAN.md §7.4 #3, §4): who may manage the team and who can be added. Pure.
import type { CareRole } from './types';

export interface CareTeamMember {
  id: string;
  doctorId: string;
  role: CareRole;
  name: string;
  note: string | null;
}

export interface DoctorOption {
  id: string;
  name: string;
  specialization: string | null;
}

/** Primary first, then backups by name. */
export function sortTeam<T extends Pick<CareTeamMember, 'role' | 'name'>>(
  members: readonly T[],
): T[] {
  return [...members].sort((a, b) =>
    a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'primary' ? -1 : 1,
  );
}

export function teamPermissions(members: readonly CareTeamMember[], me: string | null | undefined) {
  const mine = members.find((m) => m.doctorId === me);
  return {
    onTeam: mine !== undefined,
    isPrimary: mine?.role === 'primary',
    isBackup: mine?.role === 'backup',
    /** Only the primary (or an admin, elsewhere) can add, remove or hand over. */
    canManage: mine?.role === 'primary',
    primaryName: members.find((m) => m.role === 'primary')?.name ?? null,
  };
}

/** Doctors who are not on the team yet. */
export function addableDoctors(
  directory: readonly DoctorOption[],
  members: readonly CareTeamMember[],
): DoctorOption[] {
  const onTeam = new Set(members.map((m) => m.doctorId));
  return directory.filter((d) => !onTeam.has(d.id)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Doctors the primary can hand over to: current backups first, then everyone else; never herself. */
export function handOverCandidates(
  directory: readonly DoctorOption[],
  members: readonly CareTeamMember[],
  me: string | null | undefined,
): DoctorOption[] {
  const backups = new Set(members.filter((m) => m.role === 'backup').map((m) => m.doctorId));
  return directory
    .filter((d) => d.id !== me)
    .sort((a, b) => {
      const ba = backups.has(a.id) ? 0 : 1;
      const bb = backups.has(b.id) ? 0 : 1;
      return ba - bb || a.name.localeCompare(b.name);
    });
}

/** Joins active care_team rows with the doctor directory (names). Unknown doctors show as "Doctor". */
export function toTeamMembers(
  rows: readonly { id: string; doctor_id: string; care_role: CareRole; note: string | null }[],
  directory: readonly DoctorOption[],
  fallbackName: string,
): CareTeamMember[] {
  return sortTeam(
    rows.map((r) => ({
      id: r.id,
      doctorId: r.doctor_id,
      role: r.care_role,
      name: directory.find((d) => d.id === r.doctor_id)?.name ?? fallbackName,
      note: r.note,
    })),
  );
}
