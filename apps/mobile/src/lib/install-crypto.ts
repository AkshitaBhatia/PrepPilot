import * as Crypto from 'expo-crypto';

/**
 * Guarantees `crypto.getRandomValues` before any identifier is generated.
 *
 * Every row PrepPilot writes gets a client-generated UUIDv7 (D13), and that
 * generator refuses to fall back to `Math.random` — correctly, since colliding
 * ids across devices would corrupt a student's synced syllabus. It reads
 * `globalThis.crypto.getRandomValues`, which exists in Node, in browsers, and
 * in Hermes only if something installs it.
 *
 * Nothing did. The built Android bundle contained exactly one reference to
 * `getRandomValues` — the generator's own — so on a device the first write
 * threw and took start-up with it. Importing `expo-crypto` for the side effect
 * is not enough; the module exports the function without installing the global,
 * so this does it explicitly.
 *
 * Idempotent, and it never replaces a working implementation: a browser's own
 * WebCrypto is better than anything this can offer.
 */
export function installCryptoPolyfill(target: { crypto?: Partial<Crypto> } = globalThis): void {
  const existing = target.crypto;
  if (typeof existing?.getRandomValues === 'function') return;

  const patched = {
    ...existing,
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T =>
      array === null ? array : (Crypto.getRandomValues(array as never) as unknown as T),
  };

  try {
    target.crypto = patched as Crypto;
  } catch {
    // Some runtimes make `crypto` read-only. Defining it is the fallback, and
    // failing that there is nothing more to try — the generator's own error
    // says what is missing.
    try {
      Object.defineProperty(target, 'crypto', { value: patched, configurable: true });
    } catch {
      // Left to the generator to report.
    }
  }
}
