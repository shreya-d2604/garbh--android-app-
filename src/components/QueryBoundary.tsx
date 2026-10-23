import { isValidElement, type ReactNode } from 'react';

import { EmptyState, type EmptyStateProps, ErrorState, LoadingState } from './States';

/**
 * The parts of a TanStack query (or a combination of queries) the boundary needs. When
 * `isPending` is given it decides loading; otherwise loading = `isLoading` or no data yet.
 * `data` may be left out when the children are plain nodes.
 */
export interface QueryLike<T> {
  data?: T | undefined;
  isError: boolean;
  isPending?: boolean;
  isLoading?: boolean;
  refetch: () => unknown;
}

export interface QueryBoundaryProps<T> {
  query: QueryLike<T>;
  /** When this returns true and `empty` is given, `empty` is shown instead of the children. */
  isEmpty?: (data: T) => boolean;
  /** Any node, or the props of an EmptyState. */
  empty?: ReactNode | EmptyStateProps;
  loadingMessage?: string;
  children: ReactNode | ((data: T) => ReactNode);
}

function isEmptyStateProps(v: unknown): v is EmptyStateProps {
  return typeof v === 'object' && v !== null && !isValidElement(v) && 'title' in v;
}

/** The standard data-screen sequence: error (with retry) -> loading -> empty -> data. */
export function QueryBoundary<T>({
  query,
  isEmpty,
  empty,
  loadingMessage,
  children,
}: QueryBoundaryProps<T>) {
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const loading = query.isPending ?? (query.isLoading || query.data === undefined);
  if (loading) return <LoadingState message={loadingMessage} />;
  const data = query.data as T;
  if (empty !== undefined && empty !== null && isEmpty?.(data)) {
    return isEmptyStateProps(empty) ? <EmptyState {...empty} /> : <>{empty}</>;
  }
  return <>{typeof children === 'function' ? children(data) : children}</>;
}

/** Loading / error / retry of a screen that depends on several queries (add `data` yourself). */
export function combineQueries(
  ...queries: { isPending: boolean; isError: boolean; refetch: () => unknown }[]
): { isPending: boolean; isError: boolean; refetch: () => Promise<unknown[]> } {
  return {
    isPending: queries.some((q) => q.isPending),
    isError: queries.some((q) => q.isError),
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
}
