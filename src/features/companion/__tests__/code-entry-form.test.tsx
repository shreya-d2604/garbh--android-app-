import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { PaperProvider } from 'react-native-paper';

import '@/i18n';
import { paperTheme } from '@/components/theme';

import { CodeEntryForm } from '../components/CodeEntryForm';

// '@/components' pulls in expo-router (ESM) through HeaderActions; not needed here.
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) as unknown },
}));

// Own client with gcTime 0: the default 5-minute mutation GC timer would keep the Jest worker alive.
const renderWithProviders = (ui: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: 0 } },
  });
  return render(
    <PaperProvider theme={paperTheme}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </PaperProvider>,
  );
};

describe('CodeEntryForm', () => {
  beforeEach(() => mockRpc.mockReset());

  it('formats the code as typed and sends it with the chosen relation', async () => {
    mockRpc.mockResolvedValue({ data: 'link-1', error: null });
    const onRedeemed = jest.fn();
    await renderWithProviders(<CodeEntryForm onRedeemed={onRedeemed} />);

    await fireEvent.changeText(screen.getByLabelText('Code'), 'k7mq2p');
    expect(screen.getByLabelText('Code').props.value).toBe('K7M-Q2P');
    await fireEvent.press(screen.getByLabelText('Husband'));
    await fireEvent.press(screen.getByLabelText('Send request'));

    await waitFor(() => expect(onRedeemed).toHaveBeenCalledWith('link-1'));
    expect(mockRpc).toHaveBeenCalledWith('redeem_companion_code', {
      p_code: 'K7M-Q2P',
      p_relation: 'husband',
    });
  });

  it('does not call the server until the code is complete and a relation is chosen', async () => {
    await renderWithProviders(<CodeEntryForm />);
    await fireEvent.changeText(screen.getByLabelText('Code'), 'K7M');
    await fireEvent.press(screen.getByLabelText('Send request'));

    expect(await screen.findByText('Enter all 6 characters of the code')).toBeTruthy();
    expect(screen.getByText('Please choose how you are related')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('shows one message for a wrong or expired code (the RPC returns null)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await renderWithProviders(<CodeEntryForm />);
    await fireEvent.changeText(screen.getByLabelText('Code'), 'K7MQ2P');
    await fireEvent.press(screen.getByLabelText('Sibling'));
    await fireEvent.press(screen.getByLabelText('Send request'));

    expect(await screen.findByText(/not valid, or it has expired/)).toBeTruthy();
  });

  it('shows the lock-out and duplicate-link errors from the RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RATE_LIMITED', code: 'P0001' } });
    await renderWithProviders(<CodeEntryForm />);
    await fireEvent.changeText(screen.getByLabelText('Code'), 'K7MQ2P');
    await fireEvent.press(screen.getByLabelText('Friend'));
    await fireEvent.press(screen.getByLabelText('Send request'));

    expect(await screen.findByText('Too many attempts. Please try again later.')).toBeTruthy();
  });
});
