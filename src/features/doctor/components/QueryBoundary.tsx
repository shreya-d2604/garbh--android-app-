import type { ReactNode } from 'react';

import { ErrorState, LoadingState } from '@/components';

export interface QueryBoundaryProps<T> {
  query: { isPending: boolean; isError: boolean; data: T | undefined; refetch: () => unknown };
  /** Shown when the data is considered empty. */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}

/** The standard data-screen states in one place: loading -> error (retry) -> empty -> data. */
export function QueryBoundary<T>({ query, empty, isEmpty, children }: QueryBoundaryProps<T>) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const data = query.data as T;
  if (isEmpty?.(data) && empty) return <>{empty}</>;
  return <>{children(data)}</>;
}

/** Loading/error state and retry for a screen that depends on several queries. */
export function combineQueries(
  ...queries: { isPending: boolean; isError: boolean; refetch: () => unknown }[]
): { isPending: boolean; isError: boolean; refetch: () => Promise<unknown[]> } {
  return {
    isPending: queries.some((q) => q.isPending),
    isError: queries.some((q) => q.isError),
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
}
