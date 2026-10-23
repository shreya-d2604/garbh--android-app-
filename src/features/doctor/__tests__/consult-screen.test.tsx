import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import ConsultScreen from '../../../../app/doctor/consult/[appointmentId]';
import type { ConsultationBundle } from '../api';
import type { PrescriptionItemRow } from '../types';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ appointmentId: 'a1' }),
}));
jest.mock('../use-secure-screen', () => ({ useSecureScreen: jest.fn() }));
let mockIdCounter = 0;
jest.mock('../ids', () => ({
  newId: () => `00000000-0000-4000-8000-${String(++mockIdCounter).padStart(12, '0')}`,
}));

const mockFetchLast = jest.fn();
jest.mock('../api', () => ({ fetchLastPrescription: (...a: unknown[]) => mockFetchLast(...a) }));

const mockSave = jest.fn();
const mockPublish = jest.fn();
const mockStart = jest.fn();
const mockBundle = jest.fn();
jest.mock('../hooks', () => ({
  useConsultationBundle: () => mockBundle(),
  useDrugCatalog: () => ({
    data: [
      {
        id: 'd1',
        name: 'Folic acid',
        generic: 'Folic acid',
        common_strengths: ['5 mg'],
        pregnancy_caution_note: null,
        is_active: true,
      },
      {
        id: 'd2',
        name: 'Ibuprofen',
        generic: null,
        common_strengths: ['400 mg'],
        pregnancy_caution_note: 'Avoid in pregnancy',
        is_active: true,
      },
    ],
  }),
  useMyId: () => 'doc1',
  useSaveConsultation: () => ({ mutateAsync: mockSave }),
  usePublishConsultation: () => ({ mutate: mockPublish, isPending: false, error: null }),
  useStartConsultation: () => ({ mutate: mockStart, isPending: false, error: null }),
}));

const bundle = (over: Partial<ConsultationBundle['appointment']> = {}): ConsultationBundle => ({
  appointment: {
    id: 'a1',
    starts_at: new Date(2026, 9, 23, 11, 0).toISOString(),
    status: 'in_consultation',
    reason: 'Routine visit',
    pregnancy_id: 'p1',
    patient_id: 'pt1',
    doctor_id: 'doc1',
    visit_id: null,
    patients: {
      full_name: 'Kavya Iyer',
      mrn: 'GH-0003',
      is_verified: true,
      allergies: ['Penicillin'],
      blood_group: 'A+',
      rh_negative: false,
      dob: '1994-01-05',
    },
    pregnancies: { edd_final: '2027-01-10', risk_level: 'low', status: 'active' },
    ...over,
  },
  consultation: null,
  privateNote: null,
  items: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIdCounter = 0;
  mockBundle.mockReturnValue({
    isPending: false,
    isError: false,
    data: bundle(),
    refetch: jest.fn(),
  });
  mockSave.mockResolvedValue('00000000-0000-4000-8000-0000000000aa');
});

describe('consultation form', () => {
  it('shows the patient, her allergies and the autosave hint', async () => {
    await renderWithProviders(<ConsultScreen />);
    expect(screen.getByText('Kavya Iyer')).toBeTruthy();
    expect(screen.getByText('Allergy: Penicillin')).toBeTruthy();
    expect(screen.getByText('Draft saves automatically')).toBeTruthy();
  });

  it('shows loading, error and not-found states', async () => {
    mockBundle.mockReturnValue({ isPending: true });
    const { rerender } = await renderWithProviders(<ConsultScreen />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    const refetch = jest.fn();
    mockBundle.mockReturnValue({ isPending: false, isError: true, refetch });
    await rerender(<ConsultScreen />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
    mockBundle.mockReturnValue({ isPending: false, isError: false, data: null });
    await rerender(<ConsultScreen />);
    expect(screen.getByText('Appointment not found')).toBeTruthy();
  });

  it('flags a BP typo like 300/20 on both fields', async () => {
    await renderWithProviders(<ConsultScreen />);
    await fireEvent.changeText(screen.getByLabelText('BP top number'), '300');
    await fireEvent.changeText(screen.getByLabelText('BP bottom number'), '20');
    expect(await screen.findByText('BP top number should be between 70 and 250')).toBeTruthy();
    expect(await screen.findByText('BP bottom number should be between 40 and 150')).toBeTruthy();
  });

  it('shows a chip for abnormal but possible readings', async () => {
    await renderWithProviders(<ConsultScreen />);
    await fireEvent.changeText(screen.getByLabelText('BP top number'), '150');
    await fireEvent.changeText(screen.getByLabelText('BP bottom number'), '95');
    expect(await screen.findByText('BP is high')).toBeTruthy();
  });

  it('offers to start a consultation that has not started', async () => {
    mockBundle.mockReturnValue({
      isPending: false,
      isError: false,
      data: bundle({ status: 'checked_in' }),
    });
    await renderWithProviders(<ConsultScreen />);
    expect(screen.getByText('This consultation has not started')).toBeTruthy();
    await fireEvent.press(screen.getByText('Start consultation'));
    expect(mockStart).toHaveBeenCalledWith('a1', expect.any(Object));
  });

  it('will not publish an empty consultation', async () => {
    await renderWithProviders(<ConsultScreen />);
    await fireEvent.press(screen.getByText('Publish to patient'));
    expect(await screen.findByText('Add advice or a prescription before publishing.')).toBeTruthy();
    expect(screen.queryByText('Publish to the patient?')).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('confirms before publishing, then publishes with the visit status', async () => {
    await renderWithProviders(<ConsultScreen />);
    await fireEvent.changeText(screen.getByLabelText('Advice'), 'Rest and drink fluids');
    await fireEvent.press(screen.getByText('Publish to patient'));
    expect(await screen.findByText('Publish to the patient?')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('Publish to patient').at(-1) as never);
    await waitFor(() => expect(mockPublish).toHaveBeenCalled());
    const [args] = mockPublish.mock.calls[0] as [
      {
        appointmentStatus: string;
        alreadyPublished: boolean;
        withAiSummary: boolean;
        save: { values: { advice: string }; doctorId: string };
      },
    ];
    expect(args.appointmentStatus).toBe('in_consultation');
    expect(args.alreadyPublished).toBe(false);
    expect(args.withAiSummary).toBe(false);
    expect(args.save.values.advice).toBe('Rest and drink fluids');
    expect(args.save.doctorId).toBe('doc1');
  });

  it('autosaves the draft after a pause', async () => {
    jest.useFakeTimers();
    try {
      await renderWithProviders(<ConsultScreen />);
      await fireEvent.changeText(screen.getByLabelText('Advice'), 'Walk daily');
      expect(mockSave).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(1600);
      });
      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave.mock.calls[0]?.[0]).toMatchObject({
        consultationId: null,
        appointmentId: 'a1',
        pregnancyId: 'p1',
        doctorId: 'doc1',
        values: { advice: 'Walk daily' },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not create a consultation just because the screen was opened', async () => {
    jest.useFakeTimers();
    try {
      await renderWithProviders(<ConsultScreen />);
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(mockSave).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('adds a medicine row with catalog suggestions and a pregnancy caution', async () => {
    await renderWithProviders(<ConsultScreen />);
    await fireEvent.press(screen.getByText('Add a medicine'));
    await fireEvent.changeText(screen.getByLabelText('Medicine name'), 'ibu');
    await fireEvent.press(await screen.findByLabelText('Ibuprofen'));
    expect(screen.getByLabelText('Medicine name').props.value).toBe('Ibuprofen');
    expect(screen.getByLabelText('Strength').props.value).toBe('400 mg');
    expect(screen.getByText('Avoid in pregnancy')).toBeTruthy();
  });

  it('copies the last visit prescription as new rows', async () => {
    mockFetchLast.mockResolvedValue([
      {
        id: 'i1',
        consultation_id: 'c0',
        pregnancy_id: 'p1',
        drug_name: 'Ferrous ascorbate',
        strength: '100 mg',
        dosage_form: 'Tablet',
        dose: '1 tablet',
        frequency: '0-1-0',
        timing: 'After food',
        route: 'Oral',
        duration_days: 30,
        start_date: '2026-08-01',
        end_date: '2026-08-30',
        instructions: null,
        stopped_at: null,
        is_active: true,
        created_at: '2026-08-01T00:00:00Z',
      } satisfies PrescriptionItemRow,
    ]);
    await renderWithProviders(<ConsultScreen />);
    await fireEvent.press(screen.getByText('Copy from last visit'));
    await waitFor(() =>
      expect(screen.getByLabelText('Medicine name').props.value).toBe('Ferrous ascorbate'),
    );
    expect(mockFetchLast).toHaveBeenCalledWith('p1', null);
  });

  it('says so when there is nothing to copy', async () => {
    mockFetchLast.mockResolvedValue([]);
    await renderWithProviders(<ConsultScreen />);
    await fireEvent.press(screen.getByText('Copy from last visit'));
    expect(await screen.findByText('There is no earlier prescription to copy.')).toBeTruthy();
  });
});
