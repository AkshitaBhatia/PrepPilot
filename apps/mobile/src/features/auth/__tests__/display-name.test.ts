import type { User } from '@supabase/supabase-js';
import { GUEST_NAME, displayNameFor } from '../display-name';

const user = (overrides: Partial<User> = {}): User =>
  ({ id: 'u1', email: null, user_metadata: {}, ...overrides }) as User;

/**
 * Read from the account that already exists rather than stored a second time:
 * Supabase keeps the name in user metadata, put there at sign-up and by Google.
 */
describe('what to call the person using the app', () => {
  it('calls a guest Guest', () => {
    expect(displayNameFor(null, true)).toBe(GUEST_NAME);
  });

  it('calls them Guest even if a user object is lying around', () => {
    expect(displayNameFor(user({ user_metadata: { display_name: 'Archit' } }), true)).toBe(
      GUEST_NAME,
    );
  });

  it('uses the name given at sign-up', () => {
    expect(displayNameFor(user({ user_metadata: { display_name: 'Archit' } }), false)).toBe(
      'Archit',
    );
  });

  /** Google supplies full_name rather than display_name. */
  it('uses the name Google supplied', () => {
    expect(displayNameFor(user({ user_metadata: { full_name: 'Archit Sharma' } }), false)).toBe(
      'Archit',
    );
  });

  it('greets by first name, not by full name', () => {
    expect(displayNameFor(user({ user_metadata: { display_name: 'Archit Sharma' } }), false)).toBe(
      'Archit',
    );
  });

  it('prefers the name they chose over the one Google gave', () => {
    expect(
      displayNameFor(
        user({ user_metadata: { display_name: 'Archit', full_name: 'Somebody Else' } }),
        false,
      ),
    ).toBe('Archit');
  });

  /** Someone who signed up before the field existed still has an email. */
  it('falls back to the email local part', () => {
    expect(displayNameFor(user({ email: 'archit@example.com' }), false)).toBe('archit');
  });

  it('ignores a blank name rather than greeting nobody', () => {
    expect(
      displayNameFor(user({ user_metadata: { display_name: '   ' }, email: 'a@b.com' }), false),
    ).toBe('a');
  });

  it('falls back to Guest when there is nothing at all to go on', () => {
    expect(displayNameFor(user(), false)).toBe(GUEST_NAME);
  });

  it('copes with a missing user', () => {
    expect(displayNameFor(null, false)).toBe(GUEST_NAME);
  });

  it('copes with metadata that is not strings', () => {
    expect(
      displayNameFor(user({ user_metadata: { display_name: 42 }, email: 'x@y.com' }), false),
    ).toBe('x');
  });
});
