// Pure helpers for the shared Profile screen (every role).
export type RequestKind = 'deletion' | 'export';

export interface OwnRequest {
  kind: string;
  status: string;
}

/** True when the user already has an unfinished request of this kind (no duplicates). */
export function hasOpenRequest(requests: readonly OwnRequest[], kind: RequestKind): boolean {
  return requests.some(
    (r) => r.kind === kind && (r.status === 'open' || r.status === 'in_progress'),
  );
}
