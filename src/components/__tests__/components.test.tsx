import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@/test-utils/render';

import { Button } from '../Button';
import { FormField } from '../FormField';
import { EmptyState, ErrorState } from '../States';
import { StatusChip } from '../StatusChip';

const schema = z.object({ name: z.string().min(2, { error: 'validation.required' }) });

function Form({ onValid }: { onValid: (v: { name: string }) => void }) {
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });
  return (
    <>
      <FormField control={control} name="name" label="Name" />
      <Button label="Save" onPress={() => void handleSubmit(onValid)()} />
    </>
  );
}

describe('UI kit', () => {
  it('renders a status chip', async () => {
    await renderWithProviders(<StatusChip label="Booked" tone="primary" />);
    expect(screen.getByText('Booked')).toBeTruthy();
  });

  it('shows translated validation errors and submits valid input', async () => {
    const onValid = jest.fn();
    await renderWithProviders(<Form onValid={onValid} />);

    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('This field is required')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Asha');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onValid).toHaveBeenCalledWith({ name: 'Asha' }, undefined));
  });

  it('renders empty and error states with actions', async () => {
    const onRetry = jest.fn();
    await renderWithProviders(
      <>
        <EmptyState title="No appointments" actionLabel="Book" onAction={() => {}} />
        <ErrorState onRetry={onRetry} />
      </>,
    );
    expect(screen.getByText('No appointments')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalled();
  });
});
