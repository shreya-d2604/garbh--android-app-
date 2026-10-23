import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { addDays, todayISO } from '@/domain/pregnancy-math';
import { renderWithProviders } from '@/test-utils/render';

import { ApiError } from '../api';
import { BookingFlow } from '../components/BookingFlow';
import type { ReadyContext } from '../components/PatientGate';
import * as hooks from '../hooks';
import {
  appointment,
  doctor,
  member,
  patientContext,
  queryFailed,
  queryOf,
  settings,
  visit,
} from '../test-fixtures';

// @/components pulls in HeaderActions, which imports expo-router.
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
// Paper's Button `icon` loads the real icon font; render the glyph name instead.
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () =>
  jest.requireActual('../test-icon-mock'),
);
jest.mock('../hooks');

const h = jest.mocked(hooks);
const today = todayISO();

const at = (daysAhead: number, hour: number, min = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysAhead, hour, min);
};
const slot = (date: Date) => ({
  starts_at: date.toISOString(),
  ends_at: new Date(+date + 900_000).toISOString(),
});

function ctxFor(verified = true): ReadyContext {
  const c = patientContext(addDays(today, 140), { verified });
  return {
    patient: c.patient,
    pregnancy: c.pregnancy as never,
    edd: addDays(today, 140),
    settings,
  };
}

const slotsRefetch = jest.fn();
const book = jest.fn();
const reschedule = jest.fn();

function mockData(
  opts: {
    slots?: ReturnType<typeof slot>[];
    team?: ReturnType<typeof member>[];
    appts?: unknown[];
  } = {},
) {
  slotsRefetch.mockResolvedValue(undefined);
  h.useCareTeam.mockReturnValue(queryOf(opts.team ?? [member()]) as never);
  h.useDoctorDirectory.mockReturnValue(
    queryOf([doctor(), doctor({ id: 'doc-meera', full_name: 'Dr. Meera Nair' })]),
  );
  h.useVisits.mockReturnValue(
    queryOf([
      visit({
        id: 'v6',
        seq: 6,
        title: 'Visit 6',
        purpose: 'Sugar test',
        due_from: addDays(today, 5),
        due_to: addDays(today, 12),
      }),
    ]),
  );
  h.useAppointments.mockReturnValue(queryOf(opts.appts ?? []));
  h.useSlots.mockReturnValue({
    ...(queryOf(opts.slots ?? [slot(at(1, 10, 30)), slot(at(1, 11))]) as object),
    refetch: slotsRefetch,
  } as never);
  h.useBookAppointment.mockReturnValue({ mutateAsync: book, isPending: false } as never);
  h.useRescheduleAppointment.mockReturnValue({
    mutateAsync: reschedule,
    isPending: false,
  } as never);
}

describe('BookingFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pre-fills the next planned visit and books the chosen slot', async () => {
    mockData();
    book.mockResolvedValue('appt-new');
    const onDone = jest.fn();
    await renderWithProviders(<BookingFlow ctx={ctxFor()} mode="book" onDone={onDone} />);

    expect(screen.getByText('Visit 6')).toBeTruthy();
    expect(screen.getByText('Dr. Asha Rao')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('10:30 AM'));
    // Booked a few days before the visit window opens: soft warning, still allowed.
    expect(screen.getByText(/Your doctor suggests/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Confirm booking'));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('appt-new'));
    expect(book).toHaveBeenCalledWith({
      doctorId: 'doc-asha',
      startsAt: slot(at(1, 10, 30)).starts_at,
      visitId: 'v6',
      reason: 'Visit 6',
    });
  });

  it('says the slot was just taken, clears the choice and refreshes the slots', async () => {
    mockData();
    book.mockRejectedValue(new ApiError({ message: 'SLOT_TAKEN' }));
    const onDone = jest.fn();
    await renderWithProviders(<BookingFlow ctx={ctxFor()} mode="book" onDone={onDone} />);

    await fireEvent.press(screen.getByLabelText('10:30 AM'));
    await fireEvent.press(screen.getByText('Confirm booking'));

    expect(
      await screen.findByText('That slot was just taken. Please pick another time.'),
    ).toBeTruthy();
    await waitFor(() => expect(slotsRefetch).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
    // The choice is gone: asks for a new time instead of showing the old summary.
    expect(screen.getByText('Pick a time to continue.')).toBeTruthy();
  });

  it('shows a calm message and a call button when online booking is not ready', async () => {
    mockData();
    h.useSlots.mockReturnValue(
      queryFailed(slotsRefetch, new ApiError({ message: 'NOT_IMPLEMENTED' })),
    );
    await renderWithProviders(<BookingFlow ctx={ctxFor()} mode="book" onDone={jest.fn()} />);
    expect(screen.getByText('This feature is not ready yet.')).toBeTruthy();
    expect(screen.getByText('Call reception')).toBeTruthy();
  });

  it('blocks a second booking for an unverified patient and explains why', async () => {
    mockData({
      appts: [
        appointment({ starts_at: at(3, 10).toISOString(), ends_at: at(3, 11).toISOString() }),
      ],
    });
    await renderWithProviders(<BookingFlow ctx={ctxFor(false)} mode="book" onDone={jest.fn()} />);
    expect(screen.getByText(/Until your account is verified at the hospital/)).toBeTruthy();
    expect(screen.getByText(/Bring a photo ID/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('10:30 AM'));
    await fireEvent.press(screen.getByText('Confirm booking'));
    expect(book).not.toHaveBeenCalled();
  });

  it('first booking: lists doctors accepting new patients and offers Skip', async () => {
    mockData({ team: [] });
    h.useDoctorDirectory.mockReturnValue(
      queryOf([
        doctor(),
        doctor({ id: 'doc-meera', full_name: 'Dr. Meera Nair', accepts_new_patients: false }),
      ]),
    );
    const onSkip = jest.fn();
    await renderWithProviders(
      <BookingFlow ctx={ctxFor(false)} mode="first" onDone={jest.fn()} onSkip={onSkip} />,
    );
    expect(screen.getByText(/Choose a doctor and a time for your first visit/)).toBeTruthy();
    expect(screen.getByText('Dr. Asha Rao')).toBeTruthy();
    expect(screen.queryByText('Dr. Meera Nair')).toBeNull();
    await fireEvent.press(screen.getByText('Skip for now'));
    expect(onSkip).toHaveBeenCalled();
  });

  it('first booking: books with the doctor and time only, not tied to a plan visit', async () => {
    mockData({ team: [] });
    book.mockResolvedValue('appt-first');
    const onDone = jest.fn();
    await renderWithProviders(<BookingFlow ctx={ctxFor(false)} mode="first" onDone={onDone} />);
    await fireEvent.press(screen.getByLabelText('10:30 AM'));
    await fireEvent.press(screen.getByText('Confirm booking'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('appt-first'));
    expect(book).toHaveBeenCalledWith({
      doctorId: 'doc-asha',
      startsAt: slot(at(1, 10, 30)).starts_at,
      visitId: null,
      reason: null,
    });
  });

  it('reschedule: moves the appointment instead of booking a new one', async () => {
    const old = appointment({
      id: 'a-old',
      doctor_id: 'doc-asha',
      visit_id: 'v6',
      starts_at: at(5, 9).toISOString(),
      ends_at: at(5, 10).toISOString(),
    });
    mockData({ appts: [old] });
    reschedule.mockResolvedValue('a-new');
    const onDone = jest.fn();
    await renderWithProviders(
      <BookingFlow ctx={ctxFor()} mode="reschedule" appointmentId="a-old" onDone={onDone} />,
    );
    await fireEvent.press(screen.getByLabelText('11:00 AM'));
    await fireEvent.press(screen.getByText('Confirm new time'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('a-new'));
    expect(reschedule).toHaveBeenCalledWith({
      appointmentId: 'a-old',
      startsAt: slot(at(1, 11)).starts_at,
      doctorId: 'doc-asha',
    });
    expect(book).not.toHaveBeenCalled();
  });

  it('reschedule inside the cutoff asks the patient to call reception', async () => {
    const soon = appointment({
      id: 'a-soon',
      starts_at: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      ends_at: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    });
    mockData({ appts: [soon] });
    await renderWithProviders(
      <BookingFlow ctx={ctxFor()} mode="reschedule" appointmentId="a-soon" onDone={jest.fn()} />,
    );
    expect(screen.getByText(/too late to change this in the app/)).toBeTruthy();
    expect(screen.getByText('Call reception')).toBeTruthy();
    expect(screen.queryByText('Confirm new time')).toBeNull();
  });

  it('shows an error state with retry when the data cannot load', async () => {
    mockData();
    const refetch = jest.fn();
    h.useVisits.mockReturnValue(queryFailed(refetch));
    await renderWithProviders(<BookingFlow ctx={ctxFor()} mode="book" onDone={jest.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('suggests calling when nobody is bookable', async () => {
    mockData({ team: [] });
    h.useDoctorDirectory.mockReturnValue(queryOf([doctor({ accepts_new_patients: false })]));
    await renderWithProviders(<BookingFlow ctx={ctxFor()} mode="first" onDone={jest.fn()} />);
    expect(screen.getByText('No doctors to choose from')).toBeTruthy();
  });
});
