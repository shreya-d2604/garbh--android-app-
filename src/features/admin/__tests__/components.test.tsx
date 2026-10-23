import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { Text } from 'react-native';

import { Button, QueryBoundary } from '@/components';
import { renderWithProviders } from '@/test-utils/render';

import { ConfigFields } from '../components/ConfigFields';
import { ReasonDialog } from '../components/ReasonDialog';
import { configResolver } from '../components/configResolver';
import { CONFIG_TABLES, buildTablePayload, valuesFromRow, type FormValues } from '../config';
import { reasonSchema } from '../schemas';

// expo-router ships ES modules that Jest does not transform; the kit's HeaderActions imports it.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
}));

describe('ReasonDialog', () => {
  const base = {
    visible: true,
    title: 'Delete this patient?',
    confirmLabel: 'Delete patient',
    onDismiss: jest.fn(),
  };

  it('only confirms once a long enough reason is written, and passes the trimmed reason', async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(<ReasonDialog {...base} minLength={5} onConfirm={onConfirm} />);

    await fireEvent.press(screen.getByText('Delete patient'));
    expect(onConfirm).not.toHaveBeenCalled(); // disabled: empty reason

    await fireEvent.changeText(screen.getByLabelText('Reason'), 'abc');
    await fireEvent.press(screen.getByText('Delete patient'));
    expect(onConfirm).not.toHaveBeenCalled(); // still too short

    await fireEvent.changeText(screen.getByLabelText('Reason'), '  Duplicate chart  ');
    await fireEvent.press(screen.getByText('Delete patient'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Duplicate chart'));
  });

  it('also needs the typed word when one is required (second confirmation)', async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(
      <ReasonDialog {...base} minLength={5} confirmWord="DELETE" onConfirm={onConfirm} />,
    );
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Entered in error');
    await fireEvent.press(screen.getByText('Delete patient'));
    expect(onConfirm).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    await fireEvent.press(screen.getByText('Delete patient'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Entered in error'));
  });

  it('renders nothing when closed', async () => {
    await renderWithProviders(<ReasonDialog {...base} visible={false} onConfirm={jest.fn()} />);
    expect(screen.queryByText('Delete this patient?')).toBeNull();
  });

  it('uses the same reason rule as the SQL functions', () => {
    expect(reasonSchema(3).safeParse({ reason: 'ab' }).success).toBe(false);
    expect(reasonSchema(3).safeParse({ reason: 'abc' }).success).toBe(true);
  });
});

describe('QueryBoundary', () => {
  const ok = (data: string[]) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });

  it('shows loading, then an error with retry, then empty, then data', async () => {
    const { rerender } = await renderWithProviders(
      <QueryBoundary
        query={{ data: undefined, isLoading: true, isError: false, refetch: jest.fn() }}
      >
        {() => <Text>data</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Loading…')).toBeTruthy();

    const refetch = jest.fn();
    await rerender(
      <QueryBoundary query={{ data: undefined, isLoading: false, isError: true, refetch }}>
        {() => <Text>data</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();

    await rerender(
      <QueryBoundary
        query={ok([])}
        isEmpty={(d) => d.length === 0}
        empty={{ title: 'Nothing yet' }}
      >
        {() => <Text>data</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('Nothing yet')).toBeTruthy();

    await rerender(
      <QueryBoundary
        query={ok(['a'])}
        isEmpty={(d) => d.length === 0}
        empty={{ title: 'Nothing yet' }}
      >
        {(d) => <Text>{`rows: ${d.length}`}</Text>}
      </QueryBoundary>,
    );
    expect(screen.getByText('rows: 1')).toBeTruthy();
  });
});

describe('configuration form', () => {
  const def = CONFIG_TABLES.visit_templates;
  const onSave = jest.fn();

  function Form() {
    const { control, handleSubmit } = useForm<FormValues>({
      resolver: configResolver(def.fields, def.validate),
      defaultValues: valuesFromRow(def.fields, {
        schedule: 'standard',
        seq: 3,
        title: 'Routine visit',
        target_week: 16,
        window_start_week: 15,
        window_end_week: 17,
        is_active: true,
      }),
    });
    return (
      <>
        <ConfigFields group={def.key} fields={def.fields} control={control} editing />
        <Button
          label="Save"
          onPress={() =>
            void handleSubmit((v) => {
              const built = buildTablePayload(def, v, true);
              if (built.ok) onSave(built.payload);
            })()
          }
        />
      </>
    );
  }

  beforeEach(() => onSave.mockClear());

  it('shows the labelled fields and saves valid values', async () => {
    await renderWithProviders(<Form />);
    expect(screen.getByLabelText('Title')).toBeTruthy();
    expect(screen.getByLabelText('Target week')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ seq: 3, title: 'Routine visit', target_week: 16 }),
      ),
    );
  });

  it('blocks an invalid week order and explains it', async () => {
    await renderWithProviders(<Form />);
    await fireEvent.changeText(screen.getByLabelText('Window starts (week)'), '20');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('The weeks must be in order: start, target, end')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blocks a missing title', async () => {
    await renderWithProviders(<Form />);
    await fireEvent.changeText(screen.getByLabelText('Title'), '');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('This field is required')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
