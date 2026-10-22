import {
  addableDoctors,
  handOverCandidates,
  sortTeam,
  teamPermissions,
  type CareTeamMember,
  type DoctorOption,
} from '../care-team';

const m = (doctorId: string, role: 'primary' | 'backup', name: string): CareTeamMember => ({
  id: `ct-${doctorId}`,
  doctorId,
  role,
  name,
  note: null,
});
const team = [
  m('b', 'backup', 'Dr. Zed'),
  m('a', 'primary', 'Dr. Asha'),
  m('c', 'backup', 'Dr. Meera'),
];
const directory: DoctorOption[] = [
  { id: 'a', name: 'Dr. Asha', specialization: null },
  { id: 'b', name: 'Dr. Zed', specialization: null },
  { id: 'c', name: 'Dr. Meera', specialization: null },
  { id: 'd', name: 'Dr. Dev', specialization: null },
  { id: 'e', name: 'Dr. Bina', specialization: null },
];

describe('care team panel rules', () => {
  it('puts the primary first, then backups by name', () => {
    expect(sortTeam(team).map((x) => x.name)).toEqual(['Dr. Asha', 'Dr. Meera', 'Dr. Zed']);
  });

  it('only the primary can manage the team; backups are read-only', () => {
    expect(teamPermissions(team, 'a')).toMatchObject({
      onTeam: true,
      isPrimary: true,
      canManage: true,
      primaryName: 'Dr. Asha',
    });
    expect(teamPermissions(team, 'b')).toMatchObject({
      onTeam: true,
      isBackup: true,
      canManage: false,
    });
    expect(teamPermissions(team, 'x')).toMatchObject({ onTeam: false, canManage: false });
    expect(teamPermissions(team, null).canManage).toBe(false);
    expect(teamPermissions([], 'a').primaryName).toBeNull();
  });

  it('offers only doctors who are not on the team yet', () => {
    expect(addableDoctors(directory, team).map((d) => d.id)).toEqual(['e', 'd']);
  });

  it('offers backups first for a hand-over, never the caller', () => {
    expect(handOverCandidates(directory, team, 'a').map((d) => d.id)).toEqual(['c', 'b', 'e', 'd']);
  });
});
