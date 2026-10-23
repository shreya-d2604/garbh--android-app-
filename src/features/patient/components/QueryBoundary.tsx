import type { ReactNode } from 'react';

import { ErrorState, LoadingState } from '@/components';

import type { QueryState } from '../hooks';

interface Props<T> {
  query: QueryState<T>;
  /** When true for the loaded data, `empty` is rendered instead of `children`. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loadingMessage?: string;
  children: (data: T) => ReactNode;
}

/** The standard data-screen sequence: loading -> error (with retry) -> empty -> data. */
export function QueryBoundary<T>({ query, isEmpty, empty, loadingMessage, children }: Props<T>) {
  if (query.isError) return <ErrorState onRetry={query.refetch} />;
  if (query.isLoading || query.data === undefined) return <LoadingState message={loadingMessage} />;
  if (isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
