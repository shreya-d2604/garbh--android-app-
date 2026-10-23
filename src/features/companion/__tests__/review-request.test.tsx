import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import ReviewRequest from '../../../../app/patient/companions/request/[linkId]';
import { DEFAULT_PERMISSIONS } from '../permissions';
import type { PatientLinkView } from '../types';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ linkId: 'l1' }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}));

const mockMutate = jest.fn();
let mockLinks: PatientLinkView[] = [];
jest.mock('../hooks', () => ({
  useMyPatient: () => ({ data: { id: 'pt1', verified: true }, isPending: false, isError: false }),
  usePatientLinks: () => ({ data: mockLinks, isPending: false, isError: false }),
  useDecideLink: () => ({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    error: null,
  }),
}));

const pending: PatientLinkView = {
  id: 'l1',
  patient_id: 'pt1',
  companion_user_id: 'u1',
  relation: 'husband',
  relation_note: null,
  status: 'pending',
  can_view_appointments: false,
  can_view_journey: false,
  can_view_summaries: false,
  can_view_reports: false,
  can_view_prescriptions: false,
  receive_notifications: false,
  requested_at: '2026-10-22T10:00:00Z',
  decided_at: null,
  companion_name: 'Rahul',
};

describe('review a companion request', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockReplace.mockReset();
    mockLinks = [pending];
  });

  it('approves with the suggested permissions, plus whatever the patient switches on', async () => {
    await renderWithProviders(<ReviewRequest />);
    expect(screen.getByText(/Rahul \(husband\) wants to follow/)).toBeTruthy();

    await fireEvent(screen.getByRole('switch', { name: 'Reports' }), 'valueChange', true);
    await fireEvent.press(screen.getByLabelText('Approve'));

    expect(mockMutate).toHaveBeenCalledWith(
      { linkId: 'l1', approve: true, permissions: { ...DEFAULT_PERMISSIONS, reports: true } },
      expect.objectContaining({ onSuccess: expect.any(Function) as unknown }),
    );
  });

  it('asks for confirmation before declining', async () => {
    await renderWithProviders(<ReviewRequest />);
    await fireEvent.press(screen.getByLabelText('Decline'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText('Decline this request?')).toBeTruthy();
  });

  it('says so when the request is no longer open', async () => {
    mockLinks = [{ ...pending, status: 'approved' }];
    await renderWithProviders(<ReviewRequest />);
    expect(screen.getByText('This request is no longer open.')).toBeTruthy();
    expect(screen.queryByLabelText('Approve')).toBeNull();
  });
});
