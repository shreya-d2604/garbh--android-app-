// Display helpers (device timezone, English). Dates are rendered with date-fns.
import { format } from 'date-fns';

import type { ISODate } from '@/domain/pregnancy-math';

export const formatTime = (iso: string) => format(new Date(iso), 'h:mm a');
export const formatTimeRange = (start: string, end: string) =>
  `${formatTime(start)} - ${formatTime(end)}`;
export const formatDay = (iso: string) => format(new Date(iso), 'EEE d MMM');
export const formatDayTime = (iso: string) => `${formatDay(iso)}, ${formatTime(iso)}`;

/** 'YYYY-MM-DD' -> 'Fri 23 Oct' (local calendar date, no timezone shift). */
export function formatISODay(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number);
  return format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1), 'EEE d MMM');
}
