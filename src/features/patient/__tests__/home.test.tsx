import { fireEvent, screen } from '@testing-library/react-native';

import { addDays, todayISO } from '@/domain/pregnancy-math';
import { useSession } from '@/lib/session';
import { renderWithProviders } from '@/test-utils/render';

import * as hooks from '../hooks';
import {
  appointment,
  doctor,
  item,
  patientContext,
  queryFailed,
  queryLoading,
  queryOf,
  visit,
  weekContent,
} from '../test-fixtures';
import PatientHome from '../../../../app/patient/index';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../hooks');

const h = jest.mocked(hooks);
const today = todayISO();
const edd = addDays(today, 280 - (22 * 7 + 3)); // 22 weeks + 3 days today
const tomorrow10 = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  new Date().getDate() + 1,
  10,
  30,
);

const summaryRow = {
  id: 's1',
  pregnancy_id: 'preg-1',
  source_type: 'report' as const,
  source_id: 'r1',
  reviewed_by: 'doc-asha',
  published_at: '2026-09-24T05:30:00.000Z',
  final: {
    summary: {
      headline: 'Your haemoglobin is slightly low.',
      plain_language_summary: 'Mild anaemia.',
      key_findings: [
        { finding: 'Hb 10.4 g/dL', status: 'attention', explanation: 'A little low.' },
      ],
      foods_to_eat: [],
      foods_to_avoid: [],
      medicines_to_avoid: [],
      lifestyle_tips: ['Take iron after food'],
      questions_for_doctor: [],
    },
  },
};

function mockLoaded(over: { verified?: boolean } = {}) {
  h.usePullToRefresh.mockReturnValue({ refreshing: false, onRefresh: jest.fn() });
  h.usePatientContext.mockReturnValue(queryOf(patientContext(edd, over)));
  h.useWeekContent.mockReturnValue(queryOf([weekContent({ week: 20, baby_size_label: 'Banana' })]));
  h.useVisits.mockReturnValue(
    queryOf([
      visit({
        id: 'v6',
        title: 'OGTT visit',
        due_from: addDays(today, -3),
        due_to: addDays(today, 10),
        recommended_tests: ['OGTT'],
      }),
    ]),
  );
  h.useAppointments.mockReturnValue(
    queryOf([
      appointment({
        id: 'a1',
        starts_at: tomorrow10.toISOString(),
        ends_at: new Date(+tomorrow10 + 900_000).toISOString(),
      }),
    ]),
  );
  h.useDoctorMap.mockReturnValue(new Map([['doc-asha', doctor()]]));
  h.usePublishedSummaries.mockReturnValue(queryOf([summaryRow]));
  h.usePrescriptionItems.mockReturnValue(
    queryOf([
      item({ id: 'p1', start_date: addDays(today, -5), end_date: addDays(today, 30) }),
      item({ id: 'p2', drug_name: 'Old tablet', end_date: addDays(today, -1) }),
    ]),
  );
}

describe('patient home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ profile: { id: 'u1', full_name: 'Kavya Iyer' } as never });
  });

  it('shows the journey, alert, next visit, latest summary and today’s medicines', async () => {
    mockLoaded();
    await renderWithProviders(<PatientHome />);

    expect(screen.getByText('Hello, Kavya')).toBeTruthy();
    expect(screen.getByText('Week 22 + 3 days')).toBeTruthy();
    expect(screen.getByText('2nd Trimester')).toBeTruthy();
    expect(screen.getByText('Your baby is the size of a banana.')).toBeTruthy();
    expect(screen.getByText(/OGTT visit is due between/)).toBeTruthy();
    expect(screen.getByText(/10:30 AM · Dr\. Asha Rao/)).toBeTruthy();
    expect(screen.getByText('Your haemoglobin is slightly low.')).toBeTruthy();
    expect(screen.getByText('Hb 10.4 g/dL')).toBeTruthy();
    expect(screen.getByText('Ferrous ascorbate 100 mg')).toBeTruthy();
    expect(screen.queryByText('Old tablet')).toBeNull();
    // Verified patient: no ID banner.
    expect(screen.queryByText(/Bring a photo ID/)).toBeNull();
  });

  it('shows the verify banner for an unverified patient', async () => {
    mockLoaded({ verified: false });
    await renderWithProviders(<PatientHome />);
    expect(screen.getByText(/Bring a photo ID/)).toBeTruthy();
  });

  it('opens the booking flow for the alert’s visit', async () => {
    mockLoaded();
    await renderWithProviders(<PatientHome />);
    await fireEvent.press(screen.getByText('Book now'));
    expect(mockPush).toHaveBeenCalledWith('/patient/appointments/book?visit=v6');
  });

  it('shows friendly empty states', async () => {
    mockLoaded();
    h.useVisits.mockReturnValue(queryOf([]));
    h.useAppointments.mockReturnValue(queryOf([]));
    h.usePublishedSummaries.mockReturnValue(queryOf([]));
    h.usePrescriptionItems.mockReturnValue(queryOf([]));
    await renderWithProviders(<PatientHome />);
    expect(screen.getByText('You have no visit booked.')).toBeTruthy();
    expect(screen.getByText(/a short summary will show up here/)).toBeTruthy();
    expect(screen.getByText('No medicines for today.')).toBeTruthy();
  });

  it('shows a loading state, then an error with retry', async () => {
    mockLoaded();
    h.usePatientContext.mockReturnValue(queryLoading());
    const view = await renderWithProviders(<PatientHome />);
    expect(screen.getByText('Loading…')).toBeTruthy();

    const refetch = jest.fn();
    h.usePatientContext.mockReturnValue(queryFailed(refetch));
    await view.rerender(<PatientHome />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('explains when there is no active pregnancy', async () => {
    mockLoaded();
    h.usePatientContext.mockReturnValue(queryOf(patientContext(null)));
    await renderWithProviders(<PatientHome />);
    expect(screen.getByText('No pregnancy to show')).toBeTruthy();
  });

  it('keeps the rest of the screen when one section fails', async () => {
    mockLoaded();
    h.useAppointments.mockReturnValue(queryFailed());
    await renderWithProviders(<PatientHome />);
    expect(screen.getByText('Week 22 + 3 days')).toBeTruthy();
    expect(screen.getByText('Please check your connection and try again.')).toBeTruthy();
  });
});
