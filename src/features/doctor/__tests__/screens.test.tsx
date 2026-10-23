import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import AiInbox from '../../../../app/doctor/ai-inbox/index';
import PatientsScreen from '../../../../app/doctor/patients';
import TodayScreen from '../../../../app/doctor/today';
import { CareTeamPanel } from '../components/chart/CareTeamPanel';
import type { CareTeamMember, DoctorOption } from '../care-team';
import type { QueueItem } from '../queue';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockHooks = {
  useTodayQueue: jest.fn(),
  useStartConsultation: jest.fn(),
  usePatientList: jest.fn(),
  useInbox: jest.fn(),
  useAddBackup: jest.fn(),
  useRemoveMember: jest.fn(),
  useHandOver: jest.fn(),
};
jest.mock('../hooks', () => ({
  useTodayQueue: (...a: unknown[]) => mockHooks.useTodayQueue(...a),
  useStartConsultation: (...a: unknown[]) => mockHooks.useStartConsultation(...a),
  usePatientList: (...a: unknown[]) => mockHooks.usePatientList(...a),
  useInbox: (...a: unknown[]) => mockHooks.useInbox(...a),
  useAddBackup: (...a: unknown[]) => mockHooks.useAddBackup(...a),
  useRemoveMember: (...a: unknown[]) => mockHooks.useRemoveMember(...a),
  useHandOver: (...a: unknown[]) => mockHooks.useHandOver(...a),
}));

const query = (over: object) => ({
  isPending: false,
  isError: false,
  isRefetching: false,
  data: undefined,
  refetch: jest.fn(),
  ...over,
});
const mutation = (over: object = {}) => ({
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  isError: false,
  error: null,
  ...over,
});

const item = (over: Partial<QueueItem>): QueueItem => ({
  id: 'a1',
  startsAt: new Date(2026, 9, 23, 11, 0).toISOString(),
  endsAt: new Date(2026, 9, 23, 11, 15).toISOString(),
  status: 'booked',
  reason: 'Routine visit',
  channel: 'app',
  pregnancyId: 'p1',
  patientId: 'pt1',
  patientName: 'Kavya Iyer',
  mrn: 'GH-0003',
  verified: false,
  eddFinal: null,
  riskLevel: 'low',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockHooks.useStartConsultation.mockReturnValue(mutation());
});

describe('Today', () => {
  it('shows a loading state, then an error with retry', async () => {
    mockHooks.useTodayQueue.mockReturnValue(query({ isPending: true }));
    const { rerender } = await renderWithProviders(<TodayScreen />);
    expect(screen.getByText('Loading…')).toBeTruthy();

    const refetch = jest.fn();
    mockHooks.useTodayQueue.mockReturnValue(query({ isError: true, refetch }));
    await rerender(<TodayScreen />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a friendly empty state', async () => {
    mockHooks.useTodayQueue.mockReturnValue(query({ data: [] }));
    await renderWithProviders(<TodayScreen />);
    expect(screen.getByText('No appointments today')).toBeTruthy();
  });

  it('groups the queue and shows App and New · Unverified chips', async () => {
    mockHooks.useTodayQueue.mockReturnValue(
      query({
        data: [
          item({ id: 'a1' }),
          item({
            id: 'a2',
            status: 'checked_in',
            patientName: 'Priya Sharma',
            channel: 'reception',
            verified: true,
          }),
          item({
            id: 'a3',
            status: 'in_consultation',
            patientName: 'Anjali Gupta',
            channel: 'reception',
            verified: true,
          }),
          item({
            id: 'a4',
            status: 'completed',
            patientName: 'Sunita Verma',
            channel: 'reception',
            verified: true,
          }),
        ],
      }),
    );
    await renderWithProviders(<TodayScreen />);
    expect(screen.getByText('With you now (1)')).toBeTruthy();
    expect(screen.getByText('Checked in (1)')).toBeTruthy();
    expect(screen.getByText('Booked (1)')).toBeTruthy();
    expect(screen.getByText('Done (1)')).toBeTruthy();
    expect(screen.getByText('App')).toBeTruthy();
    expect(screen.getByText('New · Unverified')).toBeTruthy();
    expect(screen.getByText('Continue consultation')).toBeTruthy();
  });

  it('starts a consultation and opens the form', async () => {
    const mutate = jest.fn(
      (_id: string, opts: { onSuccess: () => void; onSettled: () => void }) => {
        opts.onSuccess();
        opts.onSettled();
      },
    );
    mockHooks.useStartConsultation.mockReturnValue(mutation({ mutate }));
    mockHooks.useTodayQueue.mockReturnValue(query({ data: [item({ id: 'a1' })] }));
    await renderWithProviders(<TodayScreen />);
    await fireEvent.press(screen.getByLabelText('Start consultation for Kavya Iyer'));
    expect(mutate).toHaveBeenCalledWith('a1', expect.any(Object));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/doctor/consult/a1'));
  });

  it('opens the chart when a card is tapped', async () => {
    mockHooks.useTodayQueue.mockReturnValue(query({ data: [item({ id: 'a1' })] }));
    await renderWithProviders(<TodayScreen />);
    await fireEvent.press(screen.getByLabelText('Open chart of Kavya Iyer'));
    expect(mockPush).toHaveBeenCalledWith('/doctor/patient/p1');
  });
});

describe('Patients', () => {
  const patient = (over: object) => ({
    pregnancyId: 'p1',
    patientId: 'pt1',
    name: 'Kavya Iyer',
    mrn: 'GH-0003',
    verified: true,
    dob: null,
    careRole: 'primary',
    riskLevel: 'low',
    status: 'active',
    eddFinal: null,
    overdueVisits: 0,
    ...over,
  });

  it('lists care-team patients and filters by search and role', async () => {
    mockHooks.usePatientList.mockReturnValue(
      query({
        data: [
          patient({}),
          patient({
            pregnancyId: 'p2',
            name: 'Anjali Gupta',
            mrn: 'GH-0004',
            careRole: 'backup',
            riskLevel: 'high',
            overdueVisits: 2,
          }),
        ],
      }),
    );
    await renderWithProviders(<PatientsScreen />);
    expect(screen.getByText('Kavya Iyer')).toBeTruthy();
    expect(screen.getByText('Anjali Gupta')).toBeTruthy();
    expect(screen.getAllByText('High risk')).toHaveLength(2); // filter chip + patient chip
    expect(screen.getByText('2 visits overdue')).toBeTruthy();

    await fireEvent.changeText(
      screen.getByLabelText('Search by name or hospital number'),
      'gh-0004',
    );
    expect(screen.queryByText('Kavya Iyer')).toBeNull();
    expect(screen.getByText('Anjali Gupta')).toBeTruthy();

    await fireEvent.changeText(
      screen.getByLabelText('Search by name or hospital number'),
      'nobody',
    );
    expect(screen.getByText('No patients match')).toBeTruthy();
    await fireEvent.press(screen.getByText('Clear filters'));
    expect(screen.getByText('Kavya Iyer')).toBeTruthy();
  });

  it('shows the empty state when the doctor has no patients', async () => {
    mockHooks.usePatientList.mockReturnValue(query({ data: [] }));
    await renderWithProviders(<PatientsScreen />);
    expect(screen.getByText('No patients yet')).toBeTruthy();
  });

  it('opens a chart on tap', async () => {
    mockHooks.usePatientList.mockReturnValue(query({ data: [patient({})] }));
    await renderWithProviders(<PatientsScreen />);
    await fireEvent.press(screen.getByLabelText('Open chart of Kavya Iyer'));
    expect(mockPush).toHaveBeenCalledWith('/doctor/patient/p1');
  });
});

describe('AI inbox', () => {
  const row = (over: object) => ({
    id: 's1',
    pregnancy_id: 'p1',
    source_type: 'report',
    status: 'draft',
    generated_at: '2026-10-23T05:00:00Z',
    created_at: '2026-10-23T05:00:00Z',
    reviewed_at: null,
    error: null,
    pregnancies: { patients: { full_name: 'Anjali Gupta' } },
    ...over,
  });

  it('shows drafts to review with counts and opens the review screen', async () => {
    mockHooks.useInbox.mockReturnValue(
      query({
        data: [
          row({}),
          row({ id: 's2', status: 'published' }),
          row({ id: 's3', status: 'failed' }),
        ],
      }),
    );
    await renderWithProviders(<AiInbox />);
    expect(screen.getByText('To review (1)')).toBeTruthy();
    expect(screen.getByText('Done (1)')).toBeTruthy();
    expect(screen.getByText('Problems (1)')).toBeTruthy();
    await fireEvent.press(screen.getByText('Anjali Gupta'));
    expect(mockPush).toHaveBeenCalledWith('/doctor/ai-inbox/s1');

    await fireEvent.press(screen.getByText('Problems (1)'));
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('shows an empty message per section', async () => {
    mockHooks.useInbox.mockReturnValue(query({ data: [] }));
    await renderWithProviders(<AiInbox />);
    expect(screen.getByText('Nothing to review')).toBeTruthy();
  });

  it('shows an error with retry', async () => {
    const refetch = jest.fn();
    mockHooks.useInbox.mockReturnValue(query({ isError: true, refetch }));
    await renderWithProviders(<AiInbox />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('Care team panel', () => {
  const members: CareTeamMember[] = [
    { id: '1', doctorId: 'asha', role: 'primary', name: 'Dr. Asha Rao', note: null },
    { id: '2', doctorId: 'meera', role: 'backup', name: 'Dr. Meera Nair', note: 'Covers leave' },
  ];
  const directory: DoctorOption[] = [
    { id: 'asha', name: 'Dr. Asha Rao', specialization: null },
    { id: 'meera', name: 'Dr. Meera Nair', specialization: null },
    { id: 'dev', name: 'Dr. Dev Patel', specialization: 'Obstetrics' },
  ];

  beforeEach(() => {
    mockHooks.useAddBackup.mockReturnValue(mutation());
    mockHooks.useRemoveMember.mockReturnValue(mutation());
    mockHooks.useHandOver.mockReturnValue(mutation());
  });

  it('lets the primary add, remove and hand over', async () => {
    await renderWithProviders(
      <CareTeamPanel pregnancyId="p1" members={members} directory={directory} me="asha" />,
    );
    expect(screen.getByText('Add a backup doctor')).toBeTruthy();
    expect(screen.getByText('Hand over as primary')).toBeTruthy();
    expect(screen.getByLabelText('Remove Dr. Meera Nair from the care team')).toBeTruthy();
  });

  it('adds a backup chosen from doctors who are not on the team yet', async () => {
    const mutate = jest.fn();
    mockHooks.useAddBackup.mockReturnValue(mutation({ mutate }));
    await renderWithProviders(
      <CareTeamPanel pregnancyId="p1" members={members} directory={directory} me="asha" />,
    );
    await fireEvent.press(screen.getByText('Add a backup doctor'));
    // Only the doctor who is not on the team yet can be picked.
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    await fireEvent.press(screen.getByLabelText('Dr. Dev Patel'));
    await fireEvent.press(screen.getByText('Add'));
    expect(mutate).toHaveBeenCalledWith({ doctorId: 'dev', note: '' }, expect.any(Object));
  });

  it('shows backups a read-only panel without any management buttons', async () => {
    await renderWithProviders(
      <CareTeamPanel pregnancyId="p1" members={members} directory={directory} me="meera" />,
    );
    expect(screen.getByText('Only Dr. Asha Rao can change the care team.')).toBeTruthy();
    expect(screen.queryByText('Add a backup doctor')).toBeNull();
    expect(screen.queryByText('Hand over as primary')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
  });

  it('lets a backup leave the care team herself after a confirmation', async () => {
    const mutate = jest.fn();
    mockHooks.useRemoveMember.mockReturnValue(mutation({ mutate }));
    await renderWithProviders(
      <CareTeamPanel pregnancyId="p1" members={members} directory={directory} me="meera" />,
    );
    await fireEvent.press(screen.getByText('Leave care team'));
    expect(screen.getByText('Leave this care team?')).toBeTruthy();
    const buttons = screen.getAllByText('Leave care team');
    await fireEvent.press(buttons[buttons.length - 1]!);
    expect(mutate).toHaveBeenCalledWith('meera', expect.any(Object));
  });

  it('does not offer the primary a way to leave', async () => {
    await renderWithProviders(
      <CareTeamPanel pregnancyId="p1" members={members} directory={directory} me="asha" />,
    );
    expect(screen.queryByText('Leave care team')).toBeNull();
  });
});
