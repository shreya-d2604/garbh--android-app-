import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import Notifications from '../../../../app/notifications';
import { useSession } from '@/lib/session';
import { renderWithProviders } from '@/test-utils/render';

import type { NotificationRow } from '../api';
import * as api from '../api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}));
jest.mock('@/lib/realtime', () => ({ useRealtimeInvalidate: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('../api');

const mocked = jest.mocked(api);

const row = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: 'n1',
  user_id: 'u1',
  type: 'appointment_booked',
  title: 'Appointment booked',
  body: 'Your visit is on Sat 24 Oct, 11:00 AM.',
  data: { route: '/patient/appointments/a1' },
  read_at: null,
  push_sent_at: null,
  push_error: null,
  created_at: new Date().toISOString(),
  ...over,
});

// React Query schedules a 5-minute garbage-collection timer per query; fake timers keep it from
// holding the Jest worker open after the suite finishes.
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.resetAllMocks();
  mockPush.mockReset();
  useSession.setState({
    status: 'signedIn',
    profile: { id: 'u1', role: 'patient' } as never,
  });
  mocked.markRead.mockResolvedValue();
  mocked.markAllRead.mockResolvedValue();
  mocked.fetchUnreadCount.mockResolvedValue(0);
});

describe('notification inbox', () => {
  it('shows a loading state, then the list', async () => {
    let resolve: (v: NotificationRow[]) => void = () => undefined;
    mocked.fetchNotifications.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderWithProviders(<Notifications />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    resolve([row()]);
    expect(await screen.findByText('Appointment booked')).toBeTruthy();
    expect(screen.getByText('Your visit is on Sat 24 Oct, 11:00 AM.')).toBeTruthy();
    expect(mocked.fetchNotifications).toHaveBeenCalledWith('u1');
  });

  it('shows an empty state', async () => {
    mocked.fetchNotifications.mockResolvedValue([]);
    await renderWithProviders(<Notifications />);
    expect(await screen.findByText('You are all caught up')).toBeTruthy();
    expect(screen.queryByText('Mark all as read')).toBeNull();
  });

  it('shows a retryable error state without raw error text', async () => {
    mocked.fetchNotifications.mockRejectedValueOnce(new Error('secret db detail'));
    await renderWithProviders(<Notifications />);
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByText(/secret db detail/)).toBeNull();
    mocked.fetchNotifications.mockResolvedValue([row()]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Appointment booked')).toBeTruthy();
  });

  it('tapping an unread notification marks it read and opens its deep link', async () => {
    mocked.fetchNotifications.mockResolvedValue([row()]);
    await renderWithProviders(<Notifications />);
    await fireEvent.press(await screen.findByText('Appointment booked'));
    expect(mockPush).toHaveBeenCalledWith('/patient/appointments/a1');
    await waitFor(() => expect(mocked.markRead).toHaveBeenCalledWith('u1', 'n1'));
  });

  it('a read notification still opens but is not marked again', async () => {
    mocked.fetchNotifications.mockResolvedValue([row({ read_at: '2026-10-23T10:00:00Z' })]);
    await renderWithProviders(<Notifications />);
    await fireEvent.press(await screen.findByText('Appointment booked'));
    expect(mockPush).toHaveBeenCalledWith('/patient/appointments/a1');
    expect(mocked.markRead).not.toHaveBeenCalled();
    expect(screen.queryByText('New')).toBeNull();
  });

  it('never navigates to an external or missing route', async () => {
    mocked.fetchNotifications.mockResolvedValue([
      row({ id: 'a', title: 'External', data: { route: 'https://evil.test' } }),
      row({ id: 'b', title: 'Nothing', data: {} }),
    ]);
    await renderWithProviders(<Notifications />);
    await fireEvent.press(await screen.findByText('External'));
    await fireEvent.press(screen.getByText('Nothing'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('marks unread items with a chip and offers "mark all as read"', async () => {
    mocked.fetchNotifications.mockResolvedValue([
      row(),
      row({ id: 'n2', title: 'Old one', read_at: '2026-10-22T10:00:00Z' }),
    ]);
    await renderWithProviders(<Notifications />);
    expect(await screen.findByText('New')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mark all as read'));
    await waitFor(() => expect(mocked.markAllRead).toHaveBeenCalledWith('u1'));
  });

  it('reports a failed mark-read without losing the list', async () => {
    mocked.fetchNotifications.mockResolvedValue([row()]);
    mocked.markAllRead.mockRejectedValue(new Error('x'));
    await renderWithProviders(<Notifications />);
    await fireEvent.press(await screen.findByText('Mark all as read'));
    expect(await screen.findByText('We could not update that. Please try again.')).toBeTruthy();
    expect(screen.getByText('Appointment booked')).toBeTruthy();
  });
});
