import { describe, expect, it, vi } from 'vitest';
import {
  cryptoRandomBytes,
  isUuidV7,
  timestampFromUuidV7,
  uuidV7,
  uuidV7From,
  type RandomBytes,
} from './uuid-v7';

/** Deterministic source so a generated identifier can be asserted exactly. */
const fixedRandom =
  (fill = 0xab): RandomBytes =>
  (byteLength) =>
    new Uint8Array(byteLength).fill(fill);

const countingRandom = (): RandomBytes => {
  let next = 0;
  return (byteLength) => Uint8Array.from({ length: byteLength }, () => next++ & 0xff);
};

describe('uuidV7From', () => {
  it('produces a canonically formatted UUID', () => {
    expect(uuidV7From(0x0192_3f4b_1c00, fixedRandom())).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sets the version nibble to 7', () => {
    const uuid = uuidV7From(Date.now(), fixedRandom());

    expect(uuid[14]).toBe('7');
  });

  it('sets the RFC 9562 variant bits', () => {
    // The 19th character encodes the variant; 0b10xx yields 8, 9, a or b.
    for (const fill of [0x00, 0x55, 0xaa, 0xff]) {
      expect(['8', '9', 'a', 'b']).toContain(uuidV7From(Date.now(), fixedRandom(fill))[19]);
    }
  });

  it('encodes the timestamp in the leading 48 bits', () => {
    const now = 1_770_000_000_000;

    expect(timestampFromUuidV7(uuidV7From(now, fixedRandom()))).toBe(now);
  });

  it('round-trips the epoch', () => {
    expect(timestampFromUuidV7(uuidV7From(0, fixedRandom()))).toBe(0);
  });

  /**
   * The reason for choosing v7 over v4: identifiers must sort by creation time
   * so index writes stay local instead of scattering across the B-tree.
   */
  it('sorts lexicographically in creation order', () => {
    const random = countingRandom();
    const ids = [1_700_000_000_000, 1_700_000_000_001, 1_700_000_001_000, 1_800_000_000_000].map(
      (ms) => uuidV7From(ms, random),
    );

    expect([...ids].sort()).toEqual(ids);
  });

  /**
   * Two subjects created in the same millisecond on the same device must not
   * collide. Uses the real CSPRNG rather than a stub: a counting stub cycles and
   * would manufacture collisions that say nothing about production behaviour.
   */
  it('produces distinct identifiers within the same millisecond', () => {
    const now = 1_700_000_000_000;
    const ids = new Set(Array.from({ length: 1000 }, () => uuidV7From(now, cryptoRandomBytes)));

    expect(ids.size).toBe(1000);
  });

  it('is deterministic for a fixed timestamp and random source', () => {
    expect(uuidV7From(1_700_000_000_000, fixedRandom())).toBe(
      uuidV7From(1_700_000_000_000, fixedRandom()),
    );
  });

  describe('input validation', () => {
    it.each([
      ['negative', -1],
      ['fractional', 1.5],
      ['NaN', Number.NaN],
      ['beyond 48 bits', 0x1_0000_0000_0000],
    ])('rejects a %s timestamp rather than truncating it', (_label, unixMs) => {
      expect(() => uuidV7From(unixMs, fixedRandom())).toThrow(RangeError);
    });

    it('accepts the largest representable timestamp', () => {
      expect(() => uuidV7From(0xffff_ffff_ffff, fixedRandom())).not.toThrow();
    });

    it('rejects a random source that returns too few bytes', () => {
      expect(() => uuidV7From(Date.now(), () => new Uint8Array(4))).toThrow(/at least 10 bytes/);
    });
  });
});

describe('isUuidV7', () => {
  it('accepts a generated identifier', () => {
    expect(isUuidV7(uuidV7From(Date.now(), fixedRandom()))).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['not a uuid', 'hello'],
    ['a v4 uuid', '9f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'],
    ['wrong variant', '0192a1b2-c3d4-7e5f-0a6b-9c8d7e6f5a4b'],
    ['uppercase', '0192A1B2-C3D4-7E5F-8A6B-9C8D7E6F5A4B'],
  ])('rejects %s', (_label, value) => {
    expect(isUuidV7(value)).toBe(false);
  });
});

describe('timestampFromUuidV7', () => {
  it('rejects anything that is not a UUIDv7', () => {
    expect(() => timestampFromUuidV7('not-a-uuid')).toThrow(RangeError);
  });
});

describe('cryptoRandomBytes', () => {
  it('returns the requested number of bytes', () => {
    expect(cryptoRandomBytes(10)).toHaveLength(10);
  });

  /**
   * Falling back to Math.random would risk collisions between devices whose rows
   * must later merge during sync, so an absent CSPRNG is a hard failure.
   */
  it('fails loudly when the platform CSPRNG is unavailable', () => {
    const original = globalThis.crypto;
    // @ts-expect-error deliberately removing the global for this assertion
    delete globalThis.crypto;

    try {
      expect(() => cryptoRandomBytes(10)).toThrow(/expo-crypto/);
    } finally {
      globalThis.crypto = original;
    }
  });
});

describe('uuidV7', () => {
  it('generates a valid identifier for the current time', () => {
    const before = Date.now();
    const uuid = uuidV7();

    expect(isUuidV7(uuid)).toBe(true);
    expect(timestampFromUuidV7(uuid)).toBeGreaterThanOrEqual(before);
    expect(timestampFromUuidV7(uuid)).toBeLessThanOrEqual(Date.now());
  });

  it('uses the current clock', () => {
    const now = 1_765_432_100_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    try {
      expect(timestampFromUuidV7(uuidV7())).toBe(now);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
