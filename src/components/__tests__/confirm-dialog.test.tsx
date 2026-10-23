import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@/test-utils/render';

import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  it('confirms, cancels with the common label, and shows extra content and an error', async () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    await renderWithProviders(
      <ConfirmDialog
        visible
        title="Remove?"
        message="This cannot be undone."
        confirmLabel="Remove"
        danger
        errorKey="common:errors.NOT_ALLOWED"
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      >
        <Text>extra</Text>
      </ConfirmDialog>,
    );
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    expect(screen.getByText('extra')).toBeTruthy();
    expect(screen.getByText('You are not allowed to do this.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Remove'));
    expect(onConfirm).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('uses a custom cancel label and can disable the confirm button', async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(
      <ConfirmDialog
        visible
        title="Leave?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        confirmDisabled
        onConfirm={onConfirm}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText('Stay')).toBeTruthy();
    await fireEvent.press(screen.getByText('Leave'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
