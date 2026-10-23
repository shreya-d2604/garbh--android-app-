import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@/test-utils/render';

import { combineQueries, QueryBoundary } from '../QueryBoundary';

const base = { isError: false, refetch: jest.fn() };

describe('QueryBoundary', () => {
  it('shows an error with a working retry before anything else', async () => {
    const refetch = jest.fn();
    await renderWithProviders(
      <QueryBoundary query={{ isError: true, isPending: true, data: undefined, refetch }}>
        {() => <Text>content</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
    expect(screen.queryByText('content')).toBeNull();
  });

  it('is loading while isPending, even when computed data is already there', async () => {
    await renderWithProviders(
      <QueryBoundary
        query={{ ...base, isPending: true, data: [] as number[] }}
        loadingMessage="Wait"
      >
        {() => <Text>content</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Wait')).toBeTruthy();
  });

  it('without isPending, is loading until there is data', async () => {
    await renderWithProviders(
      <QueryBoundary query={{ ...base, isLoading: false, data: undefined }} loadingMessage="Wait">
        {() => <Text>content</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Wait')).toBeTruthy();
  });

  it('renders an empty node, or EmptyState props, when isEmpty says so', async () => {
    const query = { ...base, isPending: false, data: [] as number[] };
    const first = await renderWithProviders(
      <QueryBoundary query={query} isEmpty={(d) => d.length === 0} empty={<Text>none</Text>}>
        {() => <Text>content</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('none')).toBeTruthy();
    await first.unmount();
    await renderWithProviders(
      <QueryBoundary query={query} isEmpty={(d) => d.length === 0} empty={{ title: 'No rows' }}>
        {() => <Text>content</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('No rows')).toBeTruthy();
  });

  it('passes the data to a render function, or renders plain children', async () => {
    const first = await renderWithProviders(
      <QueryBoundary
        query={{ ...base, isPending: false, data: [1, 2] }}
        isEmpty={(d) => d.length === 0}
      >
        {(d) => <Text>{`count ${d.length}`}</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('count 2')).toBeTruthy();
    await first.unmount();
    await renderWithProviders(
      <QueryBoundary query={{ ...base, isPending: false }}>
        <Text>plain</Text>
      </QueryBoundary>,
    );
    expect(screen.getByText('plain')).toBeTruthy();
  });

  it('combines several queries', async () => {
    const a = { isPending: false, isError: false, refetch: jest.fn() };
    const b = { isPending: true, isError: false, refetch: jest.fn() };
    const c = combineQueries(a, b);
    expect(c.isPending).toBe(true);
    expect(c.isError).toBe(false);
    await c.refetch();
    expect(a.refetch).toHaveBeenCalled();
    expect(b.refetch).toHaveBeenCalled();
  });
});
