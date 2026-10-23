import { randomUUID } from 'expo-crypto';

/** Client-generated UUID (row ids and storage file ids are created before saving). */
export function newId(): string {
  return randomUUID();
}
