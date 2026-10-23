import type { ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/components';

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

interface EmptyConfig {
  title: string;
  message?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface Props<T> {
  query: QueryLike<T>;
  /** When this returns true (and `empty` is given) the empty state is shown instead of children. */
  isEmpty?: (data: T) => boolean;
  empty?: EmptyConfig;
  children: (data: T) => ReactNode;
}

/** Loading -> error (with retry) -> empty -> data: the order every data screen follows. */
export function QueryBoundary<T>({ query, isEmpty, empty, children }: Props<T>) {
  if (query.isLoading) return <LoadingState />;
  if (query.isError || query.data === undefined)
    return <ErrorState onRetry={() => void query.refetch()} />;
  if (empty && isEmpty?.(query.data)) {
    return (
      <EmptyState
        title={empty.title}
        message={empty.message}
        icon={empty.icon as never}
        actionLabel={empty.actionLabel}
        onAction={empty.onAction}
      />
    );
  }
  return <>{children(query.data)}</>;
}
