// Display formatting. Timestamps render in the device timezone; calendar dates (YYYY-MM-DD)
// render as the same calendar day everywhere.
import { format, parseISO } from 'date-fns';

export function formatDateTime(iso: string): string {
  return format(new Date(iso), 'EEE d MMM, h:mm a');
}

export function formatDay(iso: string): string {
  return format(new Date(iso), 'd MMM yyyy');
}

/** 'YYYY-MM-DD' -> '4 Mar 2027'. */
export function formatCalendarDate(isoDate: string): string {
  return format(parseISO(isoDate), 'd MMM yyyy');
}

/** 'YYYY-MM-DD' -> '4 Mar'. */
export function formatCalendarDay(isoDate: string): string {
  return format(parseISO(isoDate), 'd MMM');
}
