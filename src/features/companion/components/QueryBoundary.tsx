import type { ReactNode } from 'react';

import { ErrorState, LoadingState } from '@/components';

interface Props {
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  children: ReactNode;
}

/** Loading -> error (with retry) -> content. Empty states are rendered by the caller. */
export function QueryBoundary({ isPending, isError, onRetry, children }: Props) {
  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  return <>{children}</>;
}
