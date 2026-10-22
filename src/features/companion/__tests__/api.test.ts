import { CodeRejectedError, createInvite, decideLink, endLink, redeemCode } from '../api';
import { DEFAULT_PERMISSIONS } from '../permissions';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) as unknown },
}));

describe('companion RPC wrappers', () => {
  beforeEach(() => mockRpc.mockReset());

  it('decide_companion_link sends every permission key explicitly', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await decideLink('l1', true, { ...DEFAULT_PERMISSIONS, reports: true });
    expect(mockRpc).toHaveBeenCalledWith('decide_companion_link', {
      p_link: 'l1',
      p_approve: true,
      p_perms: {
        appointments: true,
        journey: true,
        summaries: true,
        reports: true,
        prescriptions: false,
        notifications: true,
      },
    });
  });

  it('redeem returns the link id, and turns a null result into CodeRejectedError', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'link-1', error: null });
    await expect(redeemCode('K7M-Q2P', 'friend')).resolves.toBe('link-1');
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(redeemCode('K7M-Q2P', 'friend')).rejects.toBeInstanceOf(CodeRejectedError);
  });

  it('RPC errors are thrown unchanged so rpcErrorKey can map them', async () => {
    const error = { message: 'NOT_VERIFIED', code: 'P0001' };
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(createInvite()).rejects.toBe(error);
    await expect(endLink('l1')).rejects.toBe(error);
  });
});
