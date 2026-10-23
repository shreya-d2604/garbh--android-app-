import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import { ChoiceChips } from '../ChoiceChips';

const options = [
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
] as const;

describe('ChoiceChips', () => {
  it('selects a value and clears it when the selected chip is tapped again', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<ChoiceChips options={options} value="low" onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('High'));
    expect(onChange).toHaveBeenLastCalledWith('high');
    await fireEvent.press(screen.getByLabelText('Low'));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('keeps the selection when clearing is off', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <ChoiceChips options={options} value="low" allowClear={false} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByLabelText('Low'));
    expect(onChange).toHaveBeenLastCalledWith('low');
  });
});
