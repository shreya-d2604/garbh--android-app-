import { Text } from 'react-native';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import { SectionGate } from '../components/SectionGate';
import type { CompanionLinkView } from '../types';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

let mockLinks: Partial<CompanionLinkView>[] = [];
jest.mock('../hooks', () => ({ useCompanionLinks: () => ({ data: mockLinks }) }));

const base = {
  patient_id: 'p1',
  status: 'approved' as const,
  can_view_appointments: false,
  can_view_journey: false,
  can_view_summaries: false,
  can_view_reports: false,
  can_view_prescriptions: false,
};

describe('SectionGate', () => {
  beforeEach(() => mockRedirect.mockReset());

  it('renders the section when the permission is on', async () => {
    mockLinks = [{ ...base, can_view_reports: true }];
    await renderWithProviders(
      <SectionGate patientId="p1" section="reports">
        <Text>secret reports</Text>
      </SectionGate>,
    );
    expect(screen.getByText('secret reports')).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('sends a deep link to a hidden section back to the patient home', async () => {
    mockLinks = [{ ...base, can_view_journey: true }];
    await renderWithProviders(
      <SectionGate patientId="p1" section="reports">
        <Text>secret reports</Text>
      </SectionGate>,
    );
    expect(screen.queryByText('secret reports')).toBeNull();
    expect(mockRedirect).toHaveBeenCalledWith('/companion/p1');
  });

  it('hides everything once the link is no longer approved (revoked live)', async () => {
    mockLinks = [{ ...base, status: 'revoked' as const, can_view_reports: true }];
    await renderWithProviders(
      <SectionGate patientId="p1" section="reports">
        <Text>secret reports</Text>
      </SectionGate>,
    );
    expect(screen.queryByText('secret reports')).toBeNull();
  });
});
