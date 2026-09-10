import { describe, expect, it } from 'vitest';
import {
  OTP_LENGTH,
  PASSWORD_MAX_BYTES,
  firstFailure,
  normalizeEmail,
  normalizePhone,
  validateDisplayName,
  validateEmail,
  validateOtp,
  validatePassword,
  validatePasswordConfirmation,
  validatePhone,
} from './validation';

const message = (result: ReturnType<typeof validateEmail>) =>
  result.valid ? undefined : result.message;

describe('normalizeEmail', () => {
  it('trims and lower-cases so casing cannot create a second account', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });
});

describe('validateEmail', () => {
  it.each(['ada@example.com', 'a.b+tag@sub.example.co.uk', 'x@y.zz'])('accepts %s', (email) => {
    expect(validateEmail(email).valid).toBe(true);
  });

  it.each([
    ['', 'Enter your email address.'],
    ['   ', 'Enter your email address.'],
    ['ada', 'Enter a valid email address.'],
    ['ada@', 'Enter a valid email address.'],
    ['ada@example', 'Enter a valid email address.'],
    ['@example.com', 'Enter a valid email address.'],
    ['ada @example.com', 'Enter a valid email address.'],
    ['ada@@example.com', 'Enter a valid email address.'],
    ['ada@example..com', 'Enter a valid email address.'],
  ])('rejects %s', (email, expected) => {
    expect(message(validateEmail(email))).toBe(expected);
  });

  it('accepts an address that needs trimming', () => {
    expect(validateEmail('  ada@example.com  ').valid).toBe(true);
  });
});

describe('validatePassword', () => {
  it('accepts a password with letters and digits at the minimum length', () => {
    expect(validatePassword('passw0rd').valid).toBe(true);
  });

  it.each([
    ['', 'Enter a password.'],
    ['pass1', 'Use at least 8 characters.'],
    ['passwords', 'Include at least one letter and one number.'],
    ['12345678', 'Include at least one letter and one number.'],
  ])('rejects %s', (password, expected) => {
    expect(message(validatePassword(password))).toBe(expected);
  });

  describe('the bcrypt 72-byte ceiling', () => {
    it('accepts a password exactly at the limit', () => {
      const atLimit = 'a1'.padEnd(PASSWORD_MAX_BYTES, 'x');
      expect(atLimit).toHaveLength(PASSWORD_MAX_BYTES);
      expect(validatePassword(atLimit).valid).toBe(true);
    });

    it('rejects one byte over the limit', () => {
      const overLimit = 'a1'.padEnd(PASSWORD_MAX_BYTES + 1, 'x');
      expect(message(validatePassword(overLimit))).toBe(
        'That password is too long. Try a shorter one.',
      );
    });

    /**
     * The limit is bytes, not characters. bcrypt would silently ignore everything
     * past byte 72, so a user could change the tail of their password and find it
     * still accepted the old one.
     */
    it('counts multi-byte characters by their byte length', () => {
      // 24 four-byte emoji = 96 bytes, but only 24 code points.
      const emojiPassword = `a1${'😀'.repeat(24)}`;
      expect(emojiPassword.length).toBeLessThan(PASSWORD_MAX_BYTES);
      expect(validatePassword(emojiPassword).valid).toBe(false);
    });
  });
});

describe('validatePasswordConfirmation', () => {
  it('accepts a matching confirmation', () => {
    expect(validatePasswordConfirmation('passw0rd', 'passw0rd').valid).toBe(true);
  });

  it('rejects an empty confirmation', () => {
    expect(message(validatePasswordConfirmation('passw0rd', ''))).toBe('Re-enter your password.');
  });

  it('rejects a mismatch', () => {
    expect(message(validatePasswordConfirmation('passw0rd', 'passw0rD'))).toBe(
      'Those passwords do not match.',
    );
  });
});

describe('normalizePhone', () => {
  it('strips the separators people type', () => {
    expect(normalizePhone('+91 (98765) 43-210')).toBe('+919876543210');
  });
});

describe('validatePhone', () => {
  it.each(['+919876543210', '+14155552671', '+441234567890'])('accepts %s', (phone) => {
    expect(validatePhone(phone).valid).toBe(true);
  });

  it('accepts a number written with spaces and brackets', () => {
    expect(validatePhone('+91 98765 43210').valid).toBe(true);
  });

  it.each([
    ['', 'Enter your phone number.'],
    ['9876543210', 'Include your country code, starting with +.'],
    ['+0123456789', 'Enter a valid phone number.'],
    ['+1', 'Enter a valid phone number.'],
    ['+12345678901234567', 'Enter a valid phone number.'],
    ['+91abcdefghij', 'Enter a valid phone number.'],
  ])('rejects %s', (phone, expected) => {
    expect(message(validatePhone(phone))).toBe(expected);
  });
});

describe('validateOtp', () => {
  it('accepts a six-digit code', () => {
    expect(validateOtp('123456').valid).toBe(true);
  });

  it('accepts a code with surrounding whitespace', () => {
    expect(validateOtp('  123456 ').valid).toBe(true);
  });

  it.each([
    ['', 'Enter the code we sent you.'],
    ['12345', `The code is ${OTP_LENGTH} digits.`],
    ['1234567', `The code is ${OTP_LENGTH} digits.`],
    ['12a456', 'The code is numbers only.'],
  ])('rejects %s', (code, expected) => {
    expect(message(validateOtp(code))).toBe(expected);
  });
});

describe('validateDisplayName', () => {
  it('accepts a normal name', () => {
    expect(validateDisplayName('Arjav').valid).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(message(validateDisplayName('   '))).toBe('Enter your name.');
  });

  it('rejects an excessively long name', () => {
    expect(message(validateDisplayName('a'.repeat(61)))).toBe('That name is too long.');
  });
});

describe('firstFailure', () => {
  it('returns the first failure so a form shows one message at a time', () => {
    const result = firstFailure(
      validateEmail('ada@example.com'),
      validatePassword('short'),
      validateOtp(''),
    );

    expect(message(result)).toBe('Use at least 8 characters.');
  });

  it('passes when everything passes', () => {
    expect(firstFailure(validateEmail('ada@example.com'), validatePassword('passw0rd')).valid).toBe(
      true,
    );
  });

  it('passes when given nothing to check', () => {
    expect(firstFailure().valid).toBe(true);
  });
});
