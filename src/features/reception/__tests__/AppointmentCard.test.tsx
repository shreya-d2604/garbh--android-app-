import { renderWithProviders } from '@/test-utils/render';

import type { DeskAppointment } from '../api';
import { AppointmentCard } from '../components/AppointmentCard';

// babel-jest hoists this above the imports. The UI kit barrel imports expo-router, which Jest cannot load as ESM.
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const base: DeskAppointment = {
  id: 'a1',
  starts_at: '2030-01-07T05:00:00Z',
  ends_at: '2030-01-07T05:15:00Z',
  status: 'booked',
  booking_channel: 'reception',
  doctor_id: 'd1',
  patient_id: 'p1',
  pregnancy_id: 'pr1',
  visit_id: null,
  reason: 'Routine visit',
  patients: {
    full_name: 'Priya Sharma',
    mrn: 'GH-0001',
    phone: '+919800000001',
    verified_at: '2030-01-01T00:00:00Z',
  },
};

describe('AppointmentCard', () => {
  it('tags online bookings with "App" and shows patient, status and doctor', async () => {
    const screen = await renderWithProviders(
      <AppointmentCard
        appointment={{ ...base, booking_channel: 'app' }}
        doctorName="Dr. Asha Rao"
      />,
    );
    expect(screen.getByText('App')).toBeTruthy();
    expect(screen.getByText('Priya Sharma')).toBeTruthy();
    expect(screen.getByText('Booked')).toBeTruthy();
    expect(screen.getByText('MRN GH-0001')).toBeTruthy();
    expect(screen.getByText(/Dr\. Asha Rao/)).toBeTruthy();
    expect(screen.queryByText('Unverified')).toBeNull();
  });

  it('does not tag desk bookings, and flags unverified patients', async () => {
    const screen = await renderWithProviders(
      <AppointmentCard
        appointment={{ ...base, patients: { ...base.patients!, verified_at: null, mrn: null } }}
      />,
    );
    expect(screen.queryByText('App')).toBeNull();
    expect(screen.getByText('Unverified')).toBeTruthy();
  });

  it('survives a missing patient row', async () => {
    const screen = await renderWithProviders(
      <AppointmentCard appointment={{ ...base, patients: null }} />,
    );
    expect(screen.getByText('Unknown patient')).toBeTruthy();
  });
});
