import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import CompanionPatientHome from '../../../../app/companion/[patientId]/index';
import type { CompanionLinkView } from '../types';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ patientId: 'p1' }),
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  Redirect: () => null,
}));

let mockLinks: CompanionLinkView[] = [];
jest.mock('../hooks', () => ({
  useCompanionLinks: () => ({ data: mockLinks, isRefetching: false }),
}));
// The data cards have their own tests/queries; here only their presence matters.
jest.mock('../components/GaCard', () => ({ GaCard: () => null }));
jest.mock('../components/NextAppointmentCard', () => ({ NextAppointmentCard: () => null }));
jest.mock('../components/LatestSummaryCard', () => ({ LatestSummaryCard: () => null }));

const link = (over: Partial<CompanionLinkView> = {}): CompanionLinkView => ({
  id: 'l1',
  patient_id: 'p1',
  companion_user_id: 'u1',
  relation: 'husband',
  relation_note: null,
  status: 'approved',
  can_view_appointments: false,
  can_view_journey: false,
  can_view_summaries: false,
  can_view_reports: false,
  can_view_prescriptions: false,
  receive_notifications: false,
  requested_at: '2026-10-01T00:00:00Z',
  decided_at: '2026-10-02T00:00:00Z',
  patient_name: 'Kavya',
  ...over,
});

describe('companion home hides sections whose permission is off', () => {
  it('lists exactly the permitted sections', async () => {
    mockLinks = [link({ can_view_summaries: true, can_view_prescriptions: true })];
    await renderWithProviders(<CompanionPatientHome />);

    expect(screen.getByText('Summaries')).toBeTruthy();
    expect(screen.getByText('Prescriptions')).toBeTruthy();
    expect(screen.queryByText('Journey')).toBeNull();
    expect(screen.queryByText('Appointments')).toBeNull();
    expect(screen.queryByText('Reports')).toBeNull();
    expect(screen.queryByText(/has not shared/)).toBeNull();
  });

  it('explains when nothing has been shared', async () => {
    mockLinks = [link()];
    await renderWithProviders(<CompanionPatientHome />);

    expect(screen.getByText(/has not shared any details/)).toBeTruthy();
    for (const name of ['Journey', 'Appointments', 'Summaries', 'Reports', 'Prescriptions']) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });
});
