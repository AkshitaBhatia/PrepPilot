import * as SecureStore from 'expo-secure-store';
import { chunkByBytes, secureStorage } from '../secure-storage';

jest.mock('expo-secure-store');

const mocked = SecureStore as jest.Mocked<typeof SecureStore>;

/** An in-memory stand-in for the device keystore. */
function useFakeKeystore() {
  const store = new Map<string, string>();

  mocked.getItemAsync.mockImplementation(async (key) => store.get(key) ?? null);
  mocked.setItemAsync.mockImplementation(async (key, value) => {
    store.set(key, value);
  });
  mocked.deleteItemAsync.mockImplementation(async (key) => {
    store.delete(key);
  });

  return store;
}

describe('chunkByBytes', () => {
  it('returns a single chunk for a short value', () => {
    expect(chunkByBytes('hello', 100)).toEqual(['hello']);
  });

  it('returns one empty chunk for an empty value, not zero chunks', () => {
    expect(chunkByBytes('')).toEqual(['']);
  });

  it('splits a long value into chunks within the byte budget', () => {
    const chunks = chunkByBytes('a'.repeat(1000), 100);

    expect(chunks).toHaveLength(10);
    for (const chunk of chunks) {
      expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(100);
    }
  });

  it('rejoins to exactly the original value', () => {
    const value = 'abcdefghij'.repeat(97);
    expect(chunkByBytes(value, 64).join('')).toBe(value);
  });

  /**
   * Budgeting by UTF-16 length rather than UTF-8 bytes would let a chunk of
   * multi-byte characters exceed the platform limit.
   */
  it('budgets by byte length, not character count', () => {
    const chunks = chunkByBytes('😀'.repeat(50), 40);

    for (const chunk of chunks) {
      expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(40);
    }
  });

  /**
   * A naive slice would cut an emoji between its surrogate halves, producing
   * lone surrogates that do not survive a round trip.
   */
  it('never splits a surrogate pair', () => {
    const value = '😀'.repeat(20);
    const chunks = chunkByBytes(value, 9);

    expect(chunks.join('')).toBe(value);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(chunk).not.toMatch(/^[\uDC00-\uDFFF]/);
    }
  });

  it('rejects a budget too small to hold any character', () => {
    expect(() => chunkByBytes('abc', 3)).toThrow(RangeError);
  });
});

describe('secureStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null for a key that was never written', async () => {
    useFakeKeystore();

    await expect(secureStorage.getItem('session')).resolves.toBeNull();
  });

  it('round-trips a small value', async () => {
    useFakeKeystore();

    await secureStorage.setItem('session', '{"token":"abc"}');

    await expect(secureStorage.getItem('session')).resolves.toBe('{"token":"abc"}');
  });

  /** The case that motivates chunking: a session larger than the 2048-byte limit. */
  it('round-trips a value far larger than the platform limit', async () => {
    useFakeKeystore();
    const largeSession = JSON.stringify({ access_token: 'x'.repeat(6000) });

    await secureStorage.setItem('session', largeSession);

    await expect(secureStorage.getItem('session')).resolves.toBe(largeSession);
  });

  it('keeps every stored chunk within the platform limit', async () => {
    const store = useFakeKeystore();

    await secureStorage.setItem('session', 'y'.repeat(9000));

    const chunkValues = [...store.entries()]
      .filter(([key]) => key !== 'session')
      .map(([, value]) => value);

    expect(chunkValues.length).toBeGreaterThan(1);
    for (const value of chunkValues) {
      expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(2048);
    }
  });

  /**
   * Overwriting a long session with a short one must not leave old chunks behind;
   * a later miscount would reassemble them into a corrupt session.
   */
  it('deletes orphaned chunks when a value shrinks', async () => {
    const store = useFakeKeystore();

    await secureStorage.setItem('session', 'z'.repeat(9000));
    const chunkedKeys = [...store.keys()].filter((key) => key.startsWith('session.'));
    expect(chunkedKeys.length).toBeGreaterThan(1);

    await secureStorage.setItem('session', 'small');

    expect([...store.keys()].filter((key) => key.startsWith('session.'))).toEqual(['session.0']);
    await expect(secureStorage.getItem('session')).resolves.toBe('small');
  });

  it('removes every chunk and the index on removeItem', async () => {
    const store = useFakeKeystore();

    await secureStorage.setItem('session', 'w'.repeat(9000));
    await secureStorage.removeItem('session');

    expect(store.size).toBe(0);
    await expect(secureStorage.getItem('session')).resolves.toBeNull();
  });

  /**
   * An interrupted write leaves the index pointing at chunks that do not all
   * exist. Returning a partial session would fail to parse and could wedge
   * start-up, so the entry is discarded instead.
   */
  it('discards a partially written value rather than returning it', async () => {
    const store = useFakeKeystore();
    await secureStorage.setItem('session', 'v'.repeat(9000));
    store.delete('session.1');

    await expect(secureStorage.getItem('session')).resolves.toBeNull();
    expect(store.size).toBe(0);
  });

  it('treats a corrupted index as absent instead of throwing at start-up', async () => {
    const store = useFakeKeystore();
    store.set('session', 'not-a-number');

    await expect(secureStorage.getItem('session')).resolves.toBeNull();
  });
});
