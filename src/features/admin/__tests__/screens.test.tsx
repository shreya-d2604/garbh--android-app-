import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Dashboard from '../../../../app/admin/index';
import DataQuality from '../../../../app/admin/data-quality/index';
import Profile from '../../../../app/profile';
import { useSession } from '@/lib/session';
import { paperTheme } from '@/components/theme';

import * as api from '../api';
import type { DashboardRow } from '../format';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/features/auth/session-bootstrap', () => ({
  refreshProfile: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('../api', () => ({
  fetchDashboard: jest.fn(),
  fetchDqCounts: jest.fn(),
  fetchOwnRequests: jest.fn(),
  createOwnRequest: jest.fn(),
  updateOwnProfile: jest.fn(),
}));

const mocked = api as unknown as Record<string, jest.Mock>;

// Like renderWithProviders, but queries are dropped at once (gcTime 0, also for mutations) so no cache timers outlive a test.
async function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return await render(
    <SafeAreaProvider initialMetrics={{ frame, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <PaperProvider theme={paperTheme}>
        <QueryClientProvider client={client}>{ui}</QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>,
  );
}

const metrics: DashboardRow = {
  active_pregnancies: 10,
  trimester_1: 3,
  trimester_2: 4,
  trimester_3: 2,
  high_risk: 1,
  appointments_today: 5,
  appointments_week: 18,
  no_show_rate: 0.12,
  no_show_sample: 40,
  ai_pending: 2,
  unverified_values: 7,
  missed_visits: 0,
  unverified_patients: 3,
  open_issues: 12,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({
    profile: {
      id: 'user-1',
      role: 'admin',
      full_name: 'Admin User',
      email: 'admin@garbh.test',
      phone: null,
      avatar_path: null,
      is_active: true,
      consent_at: '2026-10-01T00:00:00Z',
      created_at: '2026-10-01T00:00:00Z',
      deleted_at: null,
    },
  });
});

describe('Dashboard', () => {
  it('shows the numbers and what needs attention, and opens the data-quality center', async () => {
    mocked.fetchDashboard?.mockResolvedValue(metrics);
    await renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Hello, Admin User')).toBeTruthy();
    expect(await screen.findByText('Active')).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
    expect(screen.getByText('Data-quality problems to fix')).toBeTruthy();

    await fireEvent.press(screen.getByText('Data-quality problems to fix'));
    expect(mockPush).toHaveBeenCalledWith('/admin/data-quality');
  });

  it('shows an error with a retry when the numbers cannot be loaded', async () => {
    mocked.fetchDashboard?.mockRejectedValueOnce(new Error('network'));
    await renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Something went wrong')).toBeTruthy();

    mocked.fetchDashboard?.mockResolvedValueOnce(metrics);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Active')).toBeTruthy();
  });
});

describe('Data quality center', () => {
  it('lists every check, problems first, and links a failing check to its items', async () => {
    mocked.fetchDqCounts?.mockResolvedValue([
      { rule: 'ga_over_42', severity: 'high', issue_count: 2 },
      { rule: 'no_app_account', severity: 'low', issue_count: 5 },
    ]);
    await renderWithProviders(<DataQuality />);
    expect(await screen.findByText('Over 42 weeks and still active')).toBeTruthy();
    expect(screen.getByText('7 items need a look')).toBeTruthy();
    expect(screen.getAllByText('Clear')).toHaveLength(10);

    await fireEvent.press(screen.getByText('Over 42 weeks and still active'));
    expect(mockPush).toHaveBeenCalledWith('/admin/data-quality/ga_over_42');
  });

  it('says so when everything is clear', async () => {
    mocked.fetchDqCounts?.mockResolvedValue([]);
    await renderWithProviders(<DataQuality />);
    expect(await screen.findByText('All clear. No data problems found.')).toBeTruthy();
  });
});

describe('Profile', () => {
  it('sends an account-deletion request after a confirmation', async () => {
    mocked.fetchOwnRequests?.mockResolvedValue([]);
    mocked.createOwnRequest?.mockResolvedValue(undefined);
    await renderWithProviders(<Profile />);
    expect(await screen.findByLabelText('Full name')).toBeTruthy();

    await fireEvent.press(screen.getByText('Delete my account'));
    expect(await screen.findByText('Delete your account?')).toBeTruthy();
    expect(mocked.createOwnRequest).not.toHaveBeenCalled(); // nothing is sent before confirming

    await fireEvent.press(screen.getByText('Send request'));
    await waitFor(() => expect(mocked.createOwnRequest).toHaveBeenCalledWith('user-1', 'deletion'));
    expect(
      await screen.findByText('Request sent. The hospital will process it and contact you.'),
    ).toBeTruthy();
  });

  it('does not allow a second deletion request while one is open', async () => {
    mocked.fetchOwnRequests?.mockResolvedValue([
      {
        id: 'r1',
        user_id: 'user-1',
        kind: 'deletion',
        status: 'open',
        created_at: '2026-10-20T10:00:00Z',
      },
    ]);
    await renderWithProviders(<Profile />);
    expect(await screen.findByText('Your deletion request is being processed.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Delete my account'));
    expect(screen.queryByText('Delete your account?')).toBeNull();
  });

  it('saves a changed name and phone', async () => {
    mocked.fetchOwnRequests?.mockResolvedValue([]);
    mocked.updateOwnProfile?.mockResolvedValue(undefined);
    await renderWithProviders(<Profile />);
    await fireEvent.changeText(await screen.findByLabelText('Full name'), 'Asha Admin');
    await fireEvent.changeText(screen.getByLabelText('Phone number'), '+91 98000 00000');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(mocked.updateOwnProfile).toHaveBeenCalledWith('user-1', {
        full_name: 'Asha Admin',
        phone: '+91 98000 00000',
      }),
    );
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('refuses an invalid name without calling the server', async () => {
    mocked.fetchOwnRequests?.mockResolvedValue([]);
    await renderWithProviders(<Profile />);
    await fireEvent.changeText(await screen.findByLabelText('Full name'), 'A');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('This field is required')).toBeTruthy();
    expect(mocked.updateOwnProfile).not.toHaveBeenCalled();
  });
});
