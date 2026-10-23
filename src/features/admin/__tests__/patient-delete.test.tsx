import '@/i18n';

import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import PatientDetail from '../../../../app/admin/patients/[id]/index';
import * as hooks from '../hooks';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'pt-1' }),
}));
jest.mock('../api', () => ({ logPatientView: jest.fn() }));
jest.mock('../hooks');

const h = jest.mocked(hooks);
const ok = <T,>(data: T) =>
  ({ data, isPending: false, isError: false, refetch: jest.fn() }) as never;
const idle = { mutate: jest.fn(), isPending: false } as never;

function patient(deleted: boolean) {
  return {
    id: 'pt-1',
    full_name: 'Synthetic Patient',
    mrn: 'GH-0001',
    verified_at: '2026-10-01T00:00:00Z',
    registration_source: 'desk',
    deleted_at: deleted ? '2026-10-20T00:00:00Z' : null,
    dob: null,
    phone: null,
    email: null,
    address: null,
    blood_group: null,
    rh_negative: null,
    allergies: [],
    chronic_conditions: [],
    emergency_contact: null,
    user_id: null,
  };
}

beforeEach(() => {
  h.usePregnancies.mockReturnValue(ok([]));
  h.useSetPatientDeleted.mockReturnValue(idle);
  h.useHardDeletePatient.mockReturnValue(idle);
});

describe('admin patient: permanent delete', () => {
  it('is offered only after the patient was deleted (soft delete first)', async () => {
    h.usePatient.mockReturnValue(ok(patient(false)));
    await renderWithProviders(<PatientDetail />);
    expect(screen.queryByText('Delete permanently…')).toBeNull();
    expect(screen.getByText(/first delete her above/)).toBeTruthy();
    expect(screen.getByText('Delete patient')).toBeTruthy();
  });

  it('shows the permanent delete for a deleted patient', async () => {
    h.usePatient.mockReturnValue(ok(patient(true)));
    await renderWithProviders(<PatientDetail />);
    expect(screen.getByText('Delete permanently…')).toBeTruthy();
    expect(screen.getByText('Restore patient')).toBeTruthy();
  });
});
