import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';

import { PermissionToggles } from '../components/PermissionToggles';
import { DEFAULT_PERMISSIONS, PERMISSION_KEYS } from '../permissions';

// '@/components' pulls in expo-router (ESM) through HeaderActions; not needed here.
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('PermissionToggles', () => {
  it('shows one switch per permission and reports changes without mutating the input', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <PermissionToggles value={DEFAULT_PERMISSIONS} onChange={onChange} />,
    );

    expect(screen.getAllByRole('switch')).toHaveLength(PERMISSION_KEYS.length);

    await fireEvent(screen.getByRole('switch', { name: 'Reports' }), 'valueChange', true);
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_PERMISSIONS, reports: true });
    expect(DEFAULT_PERMISSIONS.reports).toBe(false);
  });
});
