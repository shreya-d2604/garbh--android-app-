import { secureStorage } from '../secure-storage';

// jest.mock calls are hoisted above the imports by babel-jest.
const mockMemory = new Map<string, string>();
const mockSecure = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => void mockMemory.set(k, v)),
  removeItem: jest.fn(async (k: string) => void mockMemory.delete(k)),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecure.delete(k)),
}));
jest.mock('expo-crypto', () => ({
  getRandomValues: <T extends Uint8Array>(a: T) =>
    a.map(() => Math.floor(Math.random() * 256)) as T,
}));

describe('secureStorage', () => {
  beforeEach(() => {
    mockMemory.clear();
    mockSecure.clear();
  });

  it('round-trips a value and never stores plaintext in AsyncStorage', async () => {
    const value = JSON.stringify({ access_token: 'secret-token', user: { email: 'a@b.c' } });
    await secureStorage.setItem('sb-127-auth-token', value);

    expect([...mockMemory.values()].join()).not.toContain('secret-token');
    expect([...mockSecure.keys()]).toEqual(['garbh.sb-127-auth-token']);
    await expect(secureStorage.getItem('sb-127-auth-token')).resolves.toBe(value);
  });

  it('uses a fresh key on every write', async () => {
    await secureStorage.setItem('k', 'same');
    const first = mockMemory.get('k');
    await secureStorage.setItem('k', 'same');
    expect(mockMemory.get('k')).not.toBe(first);
  });

  it('returns null when missing and removes both halves', async () => {
    await expect(secureStorage.getItem('nope')).resolves.toBeNull();
    await secureStorage.setItem('k', 'v');
    await secureStorage.removeItem('k');
    expect(mockMemory.size + mockSecure.size).toBe(0);
  });
});
