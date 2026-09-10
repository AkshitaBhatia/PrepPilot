/**
 * UUIDv7 generation.
 *
 * Every record is created offline and must have its final identifier
 * immediately, with no server round trip (DECISIONS.md, D13). v7 is used rather
 * than v4 because its leading 48 bits are a millisecond timestamp: identifiers
 * sort by creation time, which keeps B-tree index writes local instead of
 * scattering them across the index the way random v4 keys do.
 *
 * Layout (RFC 9562 §5.7):
 *
 *   48 bits  unix timestamp in milliseconds
 *    4 bits  version (7)
 *   12 bits  rand_a
 *    2 bits  variant (0b10)
 *   62 bits  rand_b
 *
 * The random source is injected so the generator stays pure and testable, and so
 * the app can supply the platform's CSPRNG without this module reaching for a
 * global that may not exist in every runtime.
 */

export type RandomBytes = (byteLength: number) => Uint8Array;

const MAX_UNIX_MS = 0xffff_ffff_ffff; // 48 bits

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Builds a UUIDv7 from an explicit timestamp and random source.
 *
 * @throws {RangeError} if the timestamp is not a non-negative integer that fits
 * in 48 bits, since a silently truncated timestamp would break ordering.
 */
export function uuidV7From(unixMs: number, randomBytes: RandomBytes): string {
  if (!Number.isInteger(unixMs) || unixMs < 0 || unixMs > MAX_UNIX_MS) {
    throw new RangeError(`unixMs must be a 48-bit non-negative integer, received ${unixMs}`);
  }

  const random = randomBytes(10);
  if (random.length < 10) {
    throw new Error('randomBytes must return at least 10 bytes');
  }

  const bytes = new Uint8Array(16);

  // Bytes 0-5: big-endian 48-bit timestamp. Split at 2^32 because a single
  // bitwise shift in JavaScript truncates to 32 bits.
  const high = Math.floor(unixMs / 2 ** 32);
  const low = unixMs >>> 0;
  bytes[0] = (high >>> 8) & 0xff;
  bytes[1] = high & 0xff;
  bytes[2] = (low >>> 24) & 0xff;
  bytes[3] = (low >>> 16) & 0xff;
  bytes[4] = (low >>> 8) & 0xff;
  bytes[5] = low & 0xff;

  bytes.set(random, 6);

  // Byte 6 high nibble: version 7. Byte 8 top two bits: variant 0b10.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/** Extracts the creation timestamp encoded in a UUIDv7. */
export function timestampFromUuidV7(uuid: string): number {
  if (!isUuidV7(uuid)) {
    throw new RangeError(`not a UUIDv7: ${uuid}`);
  }
  return Number.parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16);
}

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}

/**
 * Uses the platform CSPRNG.
 *
 * `crypto.getRandomValues` exists in Node, in browsers, and in Hermes once
 * `expo-crypto` has installed it. `Math.random` is deliberately not used as a
 * fallback: it is not uniform enough to keep identifiers collision-free across
 * devices whose rows must later merge during sync.
 */
export const cryptoRandomBytes: RandomBytes = (byteLength) => {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.getRandomValues === undefined) {
    throw new Error(
      'crypto.getRandomValues is unavailable. Import expo-crypto before generating identifiers.',
    );
  }
  return cryptoObject.getRandomValues(new Uint8Array(byteLength));
};

/** Generates a UUIDv7 for right now using the platform CSPRNG. */
export function uuidV7(): string {
  return uuidV7From(Date.now(), cryptoRandomBytes);
}
