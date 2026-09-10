import * as SecureStore from 'expo-secure-store';

/**
 * A Supabase-compatible storage adapter backed by the device keystore.
 *
 * `expo-secure-store` refuses values larger than 2048 bytes on Android, and a
 * Supabase session — access token, refresh token, user object — routinely exceeds
 * that. Storing it unchunked works in development with a small JWT and then fails
 * in production once custom claims grow the token, so values are always chunked.
 *
 * Layout: an index entry at `key` holding the chunk count, and the payload split
 * across `key.0`, `key.1`, ... Session tokens must not fall back to unencrypted
 * storage (SECURITY.md, "Local Data"), so there is no AsyncStorage path.
 */

/** Below the 2048-byte platform limit, leaving room for the key and overhead. */
const MAX_CHUNK_BYTES = 1536;

const encoder = new TextEncoder();

const chunkKey = (key: string, index: number): string => `${key}.${index}`;

/**
 * Splits on code-point boundaries so a surrogate pair is never torn in half,
 * while budgeting by UTF-8 byte length because that is what the platform limits.
 */
export function chunkByBytes(value: string, maxBytes: number = MAX_CHUNK_BYTES): string[] {
  if (maxBytes < 4) {
    throw new RangeError('maxBytes must leave room for at least one character');
  }
  if (value.length === 0) return [''];

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  // Iterating the string yields whole code points, not UTF-16 units.
  for (const char of value) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > maxBytes) {
      chunks.push(current);
      current = char;
      currentBytes = charBytes;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  chunks.push(current);

  return chunks;
}

export interface SupabaseStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

async function readChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return 0;

  const count = Number.parseInt(raw, 10);
  // A non-numeric index means the entry predates chunking or was corrupted.
  // Treat it as absent rather than throwing during app start-up.
  return Number.isInteger(count) && count > 0 ? count : 0;
}

async function removeChunks(key: string, count: number): Promise<void> {
  const deletions: Promise<void>[] = [];
  for (let index = 0; index < count; index += 1) {
    deletions.push(SecureStore.deleteItemAsync(chunkKey(key, index)));
  }
  await Promise.all(deletions);
}

export const secureStorage: SupabaseStorage = {
  async getItem(key) {
    const count = await readChunkCount(key);
    if (count === 0) return null;

    const parts = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
    );

    // A missing chunk means the write was interrupted. A partial session is worse
    // than none: it would fail to parse and could wedge the app on start-up.
    if (parts.some((part) => part === null)) {
      await secureStorage.removeItem(key);
      return null;
    }

    return parts.join('');
  },

  async setItem(key, value) {
    const previousCount = await readChunkCount(key);
    const chunks = chunkByBytes(value);

    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)),
    );
    await SecureStore.setItemAsync(key, String(chunks.length));

    // A shorter value than last time leaves orphaned chunks behind, which would
    // be reassembled into a corrupt session if the count were ever wrong.
    for (let index = chunks.length; index < previousCount; index += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, index));
    }
  },

  async removeItem(key) {
    const count = await readChunkCount(key);
    await removeChunks(key, count);
    await SecureStore.deleteItemAsync(key);
  },
};
