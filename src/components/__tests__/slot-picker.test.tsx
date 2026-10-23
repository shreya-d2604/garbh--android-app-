import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@/test-utils/render';

import { SlotPicker } from '../SlotPicker';

const at = (h: number, m = 0) => new Date(2030, 0, 7, h, m).toISOString();
const days = [
  { date: '2030-01-07', slots: [{ starts_at: at(10) }, { starts_at: at(10, 30) }] },
  { date: '2030-01-08', slots: [{ starts_at: new Date(2030, 0, 8, 9).toISOString() }] },
];

describe('SlotPicker', () => {
  it('shows the times of the selected day and reports day and time choices', async () => {
    const onSelectDay = jest.fn();
    const onSelectSlot = jest.fn();
    await renderWithProviders(
      <SlotPicker
        days={days}
        selectedDay="2030-01-07"
        onSelectDay={onSelectDay}
        selectedSlot={null}
        onSelectSlot={onSelectSlot}
        timesHeader={<Text>Pick a time</Text>}
      />,
    );
    expect(screen.getByText('Pick a time')).toBeTruthy();
    expect(screen.getByLabelText('10:00 AM')).toBeTruthy();
    expect(screen.queryByLabelText('9:00 AM')).toBeNull();
    await fireEvent.press(screen.getByLabelText('10:30 AM'));
    expect(onSelectSlot).toHaveBeenCalledWith({ starts_at: at(10, 30) });
    await fireEvent.press(screen.getByLabelText('Tuesday 8 January, 1 free times'));
    expect(onSelectDay).toHaveBeenCalledWith('2030-01-08');
  });
});
