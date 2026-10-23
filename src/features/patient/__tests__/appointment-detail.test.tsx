import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '../api';
import { renderWithProviders } from '@/test-utils/render';

import * as hooks from '../hooks';
import {
  appointment,
  doctor,
  patientContext,
  queryFailed,
  queryLoading,
  queryOf,
  visit,
} from '../test-fixtures';
import AppointmentScreen from '../../../../app/patient/appointments/[id]';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'a1' }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../hooks');

const h = jest.mocked(hooks);
const cancel = jest.fn();
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

function mockLoaded(over: Parameters<typeof appointment>[0] = {}) {
  h.usePullToRefresh.mockReturnValue({ refreshing: false, onRefresh: jest.fn() });
  h.usePatientContext.mockReturnValue(queryOf(patientContext('2027-01-01')));
  h.useAppointment.mockReturnValue(
    queryOf(
      appointment({
        id: 'a1',
        visit_id: 'v6',
        starts_at: hoursFromNow(48),
        ends_at: hoursFromNow(48.25),
        ...over,
      }),
    ),
  );
  h.useDoctorMap.mockReturnValue(new Map([['doc-asha', doctor()]]));
  h.useVisits.mockReturnValue(queryOf([visit({ id: 'v6', title: 'Visit 6' })]));
  h.useCancelAppointment.mockReturnValue({ mutateAsync: cancel, isPending: false } as never);
}

describe('appointment detail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('before the cutoff: shows the timeline and lets her change or cancel', async () => {
    mockLoaded();
    await renderWithProviders(<AppointmentScreen />);
    expect(screen.getByText('Dr. Asha Rao')).toBeTruthy();
    expect(screen.getByText('For: Visit 6')).toBeTruthy();
    expect(screen.getByText('Where things stand')).toBeTruthy();
    // Status chip and the first timeline step.
    expect(screen.getAllByText('Booked')).toHaveLength(2);

    await fireEvent.press(screen.getByText('Change the time'));
    expect(mockPush).toHaveBeenCalledWith('/patient/appointments/book?reschedule=a1');
    expect(screen.queryByText('Call reception')).toBeNull();
  });

  it('inside the cutoff: no change buttons, only "call reception"', async () => {
    mockLoaded({ starts_at: hoursFromNow(2), ends_at: hoursFromNow(2.25) });
    await renderWithProviders(<AppointmentScreen />);
    expect(screen.getByText(/too close to the visit/)).toBeTruthy();
    expect(screen.getByText('Call reception')).toBeTruthy();
    expect(screen.queryByText('Change the time')).toBeNull();
    expect(screen.queryByText('Cancel this visit')).toBeNull();
  });

  it('cancels after confirmation', async () => {
    mockLoaded();
    cancel.mockResolvedValue(undefined);
    await renderWithProviders(<AppointmentScreen />);
    await fireEvent.press(screen.getByText('Cancel this visit'));
    expect(await screen.findByText('Cancel this visit?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Yes, cancel'));
    await waitFor(() =>
      expect(cancel).toHaveBeenCalledWith({
        appointmentId: 'a1',
        reason: 'Cancelled by patient in the app',
      }),
    );
    expect(await screen.findByText('Your visit has been cancelled.')).toBeTruthy();
  });

  it('shows the server message when the cutoff was crossed in the meantime', async () => {
    mockLoaded();
    cancel.mockRejectedValue(new ApiError({ message: 'CANCEL_CUTOFF' }));
    await renderWithProviders(<AppointmentScreen />);
    await fireEvent.press(screen.getByText('Cancel this visit'));
    await fireEvent.press(await screen.findByText('Yes, cancel'));
    expect(await screen.findByText(/too late to change this in the app/)).toBeTruthy();
  });

  it('a cancelled visit has no timeline and offers to book again', async () => {
    mockLoaded({ status: 'cancelled' });
    await renderWithProviders(<AppointmentScreen />);
    expect(screen.getByText('This visit was cancelled.')).toBeTruthy();
    expect(screen.queryByText('Where things stand')).toBeNull();
    await fireEvent.press(screen.getByText('Book again'));
    expect(mockPush).toHaveBeenCalledWith('/patient/appointments/book?visit=v6');
  });

  it('shows loading and error states', async () => {
    mockLoaded();
    h.useAppointment.mockReturnValue(queryLoading());
    const view = await renderWithProviders(<AppointmentScreen />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    const refetch = jest.fn();
    h.useAppointment.mockReturnValue(queryFailed(refetch));
    await view.rerender(<AppointmentScreen />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});
