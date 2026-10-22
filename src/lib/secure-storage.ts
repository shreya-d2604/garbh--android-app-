// Encrypted session storage (PLAN.md §3 "LargeSecureStore" pattern).
// SecureStore has a ~2KB value limit, so it holds only a random AES-256 key per item;
// the (larger) ciphertext lives in AsyncStorage. A fresh key is generated on every write.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// SecureStore keys may only contain alphanumerics, '.', '-' and '_'.
const keyName = (key: string) => `garbh.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export function encrypt(value: string, keyBytes: Uint8Array): string {
  const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  return aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(value)));
}

export function decrypt(cipherHex: string, keyBytes: Uint8Array): string {
  const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(cipherHex)));
}

export const secureStorage: KeyValueStore = {
  async getItem(key) {
    const cipherHex = await AsyncStorage.getItem(key);
    if (!cipherHex) return null;
    const keyHex = await SecureStore.getItemAsync(keyName(key));
    if (!keyHex) return null;
    return decrypt(cipherHex, aesjs.utils.hex.toBytes(keyHex));
  },
  async setItem(key, value) {
    const keyBytes = getRandomValues(new Uint8Array(32));
    await SecureStore.setItemAsync(keyName(key), aesjs.utils.hex.fromBytes(keyBytes));
    await AsyncStorage.setItem(key, encrypt(value, keyBytes));
  },
  async removeItem(key) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(keyName(key));
  },
};
