import type { ComponentProps, ReactNode } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/components';

export interface QueryStateProps {
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Render the empty state instead of children. */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyIcon?: ComponentProps<typeof EmptyState>['icon'];
  children: ReactNode;
}

/** Loading -> error (with retry) -> empty -> data: the order every data screen uses (docs/ui-kit.md). */
export function QueryState({
  isPending,
  isError,
  onRetry,
  isEmpty,
  emptyTitle = '',
  emptyMessage,
  emptyIcon,
  children,
}: QueryStateProps) {
  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (isEmpty) return <EmptyState title={emptyTitle} message={emptyMessage} icon={emptyIcon} />;
  return <>{children}</>;
}
