import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, isValidName } from './types';

/**
 * The limit is enforced wherever a name enters the database, not only in the
 * sheet a student types into. Names also arrive from a model's proposal and from
 * a generated template, and neither passes through that sheet.
 */
describe('isValidName', () => {
  it('accepts an ordinary name', () => {
    expect(isValidName('Organic Chemistry')).toBe(true);
  });

  it('accepts a name exactly at the limit', () => {
    expect(isValidName('a'.repeat(MAX_NAME_LENGTH))).toBe(true);
  });

  it('rejects one character past the limit', () => {
    expect(isValidName('a'.repeat(MAX_NAME_LENGTH + 1))).toBe(false);
  });

  it('measures after trimming, so padding cannot push a valid name over', () => {
    expect(isValidName(`  ${'a'.repeat(MAX_NAME_LENGTH)}  `)).toBe(true);
  });

  it('rejects a name that is only whitespace', () => {
    expect(isValidName('   ')).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(isValidName('')).toBe(false);
  });

  it('rejects anything that is not a string', () => {
    // Proposals are parsed from model output, so the type is not guaranteed.
    for (const value of [null, undefined, 42, {}, ['a'], true]) {
      expect(isValidName(value)).toBe(false);
    }
  });
});
