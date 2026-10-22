import common from '@/i18n/en/common.json';

import { RPC_ERROR_CODES, rpcErrorCode, rpcErrorKey } from '../rpc-errors';

describe('rpc errors', () => {
  it('reads codes raised by SQL', () => {
    expect(rpcErrorCode({ message: 'SLOT_TAKEN', code: 'P0001' })).toBe('SLOT_TAKEN');
  });

  it('maps SQLSTATEs', () => {
    expect(
      rpcErrorCode({
        message: 'conflicting key value violates exclusion constraint',
        code: '23P01',
      }),
    ).toBe('SLOT_TAKEN');
    expect(
      rpcErrorCode({ message: 'new row violates row-level security policy', code: '42501' }),
    ).toBe('NOT_ALLOWED');
  });

  it('falls back to a generic key', () => {
    expect(rpcErrorKey({ message: 'boom' })).toBe('errors.GENERIC');
    expect(rpcErrorKey(null)).toBe('errors.GENERIC');
  });

  it('has an English message for every code', () => {
    for (const code of RPC_ERROR_CODES) {
      expect(common.errors).toHaveProperty(code);
    }
  });
});
