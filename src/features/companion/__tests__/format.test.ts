import { formatCalendarDate, formatCalendarDay } from '../format';

describe('format', () => {
  it('shows a calendar date as the same day whatever the timezone', () => {
    expect(formatCalendarDate('2027-03-04')).toBe('4 Mar 2027');
    expect(formatCalendarDay('2027-03-04')).toBe('4 Mar');
    expect(formatCalendarDate('2026-12-31')).toBe('31 Dec 2026');
  });
});
