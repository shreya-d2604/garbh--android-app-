// Realtime -> React Query bridge (PLAN.md §8.5). RLS applies to postgres_changes, so a
// subscriber only ever receives rows it may read.
//
//   useRealtimeInvalidate({ table: 'appointments', filter: `patient_id=eq.${patientId}`,
//                           queryKey: ['patient', 'appointments'] });
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';

import { supabase } from './supabase';

/** Tables in the supabase_realtime publication (migration 20261023001400). */
export type RealtimeTable = 'appointments' | 'notifications' | 'companion_links' | 'ai_summaries';

export interface RealtimeInvalidateOptions {
  table: RealtimeTable;
  /** PostgREST-style filter, e.g. `doctor_id=eq.<uuid>`. Omit for all visible rows. */
  filter?: string;
  /** Query key (prefix) to invalidate on any insert/update/delete. */
  queryKey: QueryKey;
  enabled?: boolean;
}

export function useRealtimeInvalidate({
  table,
  filter,
  queryKey,
  enabled = true,
}: RealtimeInvalidateOptions) {
  const queryClient = useQueryClient();
  const key = JSON.stringify(queryKey);

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`rt:${table}:${filter ?? '*'}:${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => {
        void queryClient.invalidateQueries({ queryKey: JSON.parse(key) as QueryKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, key, enabled, queryClient]);
}
