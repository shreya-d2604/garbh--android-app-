import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useRealtimeInvalidate } from '../realtime';

const mockHandlers: (() => void)[] = [];
interface MockChannel {
  on: jest.Mock;
  subscribe: jest.Mock;
}
const mockChannel: MockChannel = {
  on: jest.fn((_type: string, _opts: unknown, handler: () => void): MockChannel => {
    mockHandlers.push(handler);
    return mockChannel;
  }),
  subscribe: jest.fn((): MockChannel => mockChannel),
};
const mockRemove = jest.fn();

jest.mock('../supabase', () => ({
  supabase: { channel: jest.fn(() => mockChannel), removeChannel: (c: unknown) => mockRemove(c) },
}));

describe('useRealtimeInvalidate', () => {
  it('subscribes with the filter, invalidates the key on change, and cleans up', async () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { unmount } = await renderHook(
      () =>
        useRealtimeInvalidate({
          table: 'appointments',
          filter: 'patient_id=eq.p1',
          queryKey: ['patient', 'appointments'],
        }),
      { wrapper },
    );

    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'appointments', filter: 'patient_id=eq.p1' },
      expect.any(Function),
    );
    mockHandlers[0]?.();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['patient', 'appointments'] });

    await unmount();
    expect(mockRemove).toHaveBeenCalledWith(mockChannel);
  });
});
