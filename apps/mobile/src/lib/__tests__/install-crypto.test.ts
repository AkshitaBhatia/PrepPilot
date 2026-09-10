import * as Crypto from 'expo-crypto';
import { installCryptoPolyfill } from '../install-crypto';

jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn((array: Uint8Array) => {
    array.fill(7);
    return array;
  }),
}));

const mockedGetRandomValues = Crypto.getRandomValues as jest.MockedFunction<
  typeof Crypto.getRandomValues
>;

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * Every row gets a client-generated UUIDv7, and that generator refuses to fall
 * back to Math.random. On Hermes nothing installed `crypto.getRandomValues`, so
 * the first write threw and took start-up with it.
 */
describe('making crypto.getRandomValues available', () => {
  it('installs it where there is no crypto at all', () => {
    const target: { crypto?: Partial<Crypto> } = {};

    installCryptoPolyfill(target);

    expect(typeof target.crypto?.getRandomValues).toBe('function');
  });

  it('fills the array it is given', () => {
    const target: { crypto?: Partial<Crypto> } = {};
    installCryptoPolyfill(target);

    const filled = target.crypto?.getRandomValues?.(new Uint8Array(4));

    expect(Array.from(filled as Uint8Array)).toEqual([7, 7, 7, 7]);
  });

  /** A browser's own WebCrypto is better than anything this can offer. */
  it('leaves a working implementation alone', () => {
    const existing = jest.fn();
    const target = { crypto: { getRandomValues: existing } as unknown as Partial<Crypto> };

    installCryptoPolyfill(target);

    expect(target.crypto?.getRandomValues).toBe(existing);
    expect(mockedGetRandomValues).not.toHaveBeenCalled();
  });

  it('fills the gap when crypto exists without the method', () => {
    const target = { crypto: { subtle: {} } as unknown as Partial<Crypto> };

    installCryptoPolyfill(target);

    expect(typeof target.crypto?.getRandomValues).toBe('function');
  });

  it('keeps whatever else crypto already carried', () => {
    const subtle = {} as SubtleCrypto;
    const target = { crypto: { subtle } as unknown as Partial<Crypto> };

    installCryptoPolyfill(target);

    expect(target.crypto?.subtle).toBe(subtle);
  });

  it('can be run twice without trouble', () => {
    const target: { crypto?: Partial<Crypto> } = {};

    installCryptoPolyfill(target);
    const first = target.crypto?.getRandomValues;
    installCryptoPolyfill(target);

    expect(target.crypto?.getRandomValues).toBe(first);
  });

  /** Some runtimes make `crypto` read-only; the app must still start. */
  it('does not throw when the global cannot be assigned', () => {
    const target = {};
    Object.defineProperty(target, 'crypto', { value: undefined, writable: false });

    expect(() => installCryptoPolyfill(target)).not.toThrow();
  });

  // WebCrypto's signature allows null; the polyfill must not call through with
  // it, since expo-crypto would throw on a missing array.
  it('passes a null array straight back', () => {
    const target: { crypto?: Partial<Crypto> } = {};
    installCryptoPolyfill(target);

    expect(target.crypto?.getRandomValues?.(null as never)).toBeNull();
  });
});
