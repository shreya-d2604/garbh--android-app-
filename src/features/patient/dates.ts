// Display helpers. Timestamps are shown in the device timezone (AGENTS.md §4); ISO calendar
// dates ('YYYY-MM-DD') are parsed as local dates so they never shift by a day.
import { format, parseISO } from 'date-fns';

import type { ISODate } from '@/domain/pregnancy-math';

/** Device-local calendar day of a timestamp, as 'YYYY-MM-DD'. */
export function localDayKey(timestamp: string | Date): ISODate {
  return format(typeof timestamp === 'string' ? new Date(timestamp) : timestamp, 'yyyy-MM-dd');
}

export function formatTime(timestamp: string): string {
  return format(new Date(timestamp), 'h:mm a');
}

/** "Tue, 28 Oct" */
export function formatDay(timestamp: string): string {
  return format(new Date(timestamp), 'EEE, d MMM');
}

/** "Tue, 28 Oct, 10:30 AM" */
export function formatDayTime(timestamp: string): string {
  return format(new Date(timestamp), 'EEE, d MMM, h:mm a');
}

/** "4 Mar" from 'YYYY-MM-DD'. */
export function formatDate(iso: ISODate): string {
  return format(parseISO(iso), 'd MMM');
}

/** "4 Mar 2026" from 'YYYY-MM-DD'. */
export function formatDateLong(iso: ISODate): string {
  return format(parseISO(iso), 'd MMM yyyy');
}

/** "4 Mar" / "4 Mar 2026" from a timestamp. */
export function formatStamp(timestamp: string): string {
  return format(new Date(timestamp), 'd MMM yyyy');
}

export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}
