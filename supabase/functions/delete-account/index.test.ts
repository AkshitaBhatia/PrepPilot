import { assertEquals } from 'jsr:@std/assert@1';
import { callerId, handler } from './index.ts';

function bearer(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  return `Bearer header.${payload}.signature`;
}

function request(options: { authorization?: string; method?: string } = {}): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const authorization = options.authorization ?? bearer({ sub: 'user-1', role: 'authenticated' });
  if (authorization !== '') headers.set('Authorization', authorization);

  return new Request('https://example.test/delete-account', {
    method: options.method ?? 'POST',
    headers,
  });
}

/** Reads `sub` back out of a stub token, the way Supabase would. */
function subjectOf(authorization: string): string | null {
  const payload = authorization.split('.')[1];
  if (payload === undefined) return null;
  try {
    const normalised = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

async function withEnv(
  env: Record<string, string | null>,
  run: (calls: Request[]) => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, Deno.env.get(key));
    if (value === null) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }

  const originalFetch = globalThis.fetch;
  const calls: Request[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);

    // The handler asks Supabase who the token belongs to before deleting
    // anything. By default the stub vouches for the account the token claims,
    // which is the case every test but the forgery ones are about.
    if (req.url.endsWith('/auth/v1/user')) {
      const claimed = subjectOf(req.headers.get('Authorization') ?? '');
      return Promise.resolve(
        claimed === null
          ? new Response(null, { status: 401 })
          : new Response(JSON.stringify({ id: claimed }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
      );
    }

    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

const CONFIGURED = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
};

Deno.test('deletes the account named by the caller’s own token', async () => {
  await withEnv(CONFIGURED, async (calls) => {
    const response = await handler(request());

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { deleted: true });
    // Two calls: "whose token is this?", then the delete for that account.
    assertEquals(calls.length, 2);
    assertEquals(calls[0].url, 'https://project.supabase.co/auth/v1/user');
    assertEquals(calls[1].method, 'DELETE');
    assertEquals(calls[1].url, 'https://project.supabase.co/auth/v1/admin/users/user-1');
  });
});

Deno.test('never takes the account to delete from the request', async () => {
  // An id in the body would let anyone delete anybody. Only the verified `sub`
  // decides, so a body naming someone else changes nothing.
  await withEnv(CONFIGURED, async (calls) => {
    const forged = new Request('https://example.test/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: bearer({ sub: 'user-1', role: 'authenticated' }),
      },
      body: JSON.stringify({ userId: 'someone-else', id: 'someone-else' }),
    });

    await handler(forged);

    // calls[0] verifies the token; calls[1] is the deletion, and it names the
    // account the token belongs to rather than anything from the body.
    assertEquals(calls[1].url.endsWith('/user-1'), true);
  });
});

Deno.test('refuses a request carrying only the publishable key', async () => {
  // An anon token has no user behind it; deleting on its strength would let
  // anyone holding the public key delete accounts.
  await withEnv(CONFIGURED, async (calls) => {
    const response = await handler(request({ authorization: bearer({ role: 'anon' }) }));

    assertEquals(response.status, 401);
    assertEquals(calls.length, 0);
  });
});

Deno.test('refuses a service-role token, which names no student', async () => {
  await withEnv(CONFIGURED, async (calls) => {
    const response = await handler(
      request({ authorization: bearer({ role: 'service_role', sub: 'user-1' }) }),
    );

    assertEquals(response.status, 401);
    assertEquals(calls.length, 0);
  });
});

Deno.test('refuses a request with no token at all', async () => {
  await withEnv(CONFIGURED, async (calls) => {
    const response = await handler(request({ authorization: '' }));

    assertEquals(response.status, 401);
    assertEquals(calls.length, 0);
  });
});

Deno.test('never names the missing configuration', async () => {
  await withEnv({ ...CONFIGURED, SUPABASE_SERVICE_ROLE_KEY: null }, async (calls) => {
    const response = await handler(request());
    const { error } = await response.json();

    assertEquals(response.status, 503);
    assertEquals(error, 'Account deletion is not configured.');
    assertEquals(calls.length, 0);
  });
});

Deno.test('treats an already-deleted account as success', async () => {
  const previousUrl = Deno.env.get('SUPABASE_URL');
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  Deno.env.set('SUPABASE_URL', CONFIGURED.SUPABASE_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', CONFIGURED.SUPABASE_SERVICE_ROLE_KEY);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = input instanceof Request ? input.url : String(input);
    // Supabase vouches for the token; the account is then already gone.
    if (url.endsWith('/auth/v1/user')) {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'user-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  }) as typeof fetch;

  try {
    // The student asked for the account not to exist, and it does not. Reporting
    // a failure would invite them to retry something that already worked.
    const response = await handler(request());
    assertEquals(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', previousUrl);
    if (previousKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousKey);
  }
});

Deno.test('never leaks the service-role key into a response', async () => {
  const previousUrl = Deno.env.get('SUPABASE_URL');
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  Deno.env.set('SUPABASE_URL', CONFIGURED.SUPABASE_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-secret');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith('/auth/v1/user')) {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'user-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ msg: 'bad key service-role-secret' }), { status: 401 }),
    );
  }) as typeof fetch;

  try {
    const response = await handler(request());
    const text = await response.text();

    assertEquals(response.status, 502);
    assertEquals(text.includes('service-role-secret'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', previousUrl);
    if (previousKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousKey);
  }
});

Deno.test('answers the browser preflight', async () => {
  const response = await handler(request({ method: 'OPTIONS' }));
  assertEquals(response.status, 204);
});

Deno.test('refuses anything but POST', async () => {
  assertEquals((await handler(request({ method: 'GET' }))).status, 405);
});

Deno.test('callerId reads the subject, not the body', () => {
  assertEquals(callerId(request()), 'user-1');
  assertEquals(callerId(request({ authorization: 'Bearer not-a-jwt' })), null);
});

/**
 * The account deleted is the one Supabase says the token belongs to, not the
 * one the token claims. Decoding alone trusts that the platform checked the
 * signature — true by default, but one deploy flag away from being false, and
 * the consequence is anyone deleting anyone.
 */
Deno.test('refuses a token Supabase will not vouch for', async () => {
  const previousUrl = Deno.env.get('SUPABASE_URL');
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  Deno.env.set('SUPABASE_URL', CONFIGURED.SUPABASE_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', CONFIGURED.SUPABASE_SERVICE_ROLE_KEY);

  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  // A forged token: well-formed, names a real account, no valid signature.
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (url.endsWith('/auth/v1/user')) {
      return Promise.resolve(new Response(null, { status: 401 }));
    }
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const response = await handler(
      request({ authorization: bearer({ sub: 'victim', role: 'authenticated' }) }),
    );

    assertEquals(response.status, 401);
    // The important part: no deletion was attempted.
    assertEquals(
      calls.some((url) => url.includes('/admin/users/')),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', previousUrl);
    if (previousKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousKey);
  }
});

Deno.test('refuses when the token names one account and Supabase names another', async () => {
  const previousUrl = Deno.env.get('SUPABASE_URL');
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  Deno.env.set('SUPABASE_URL', CONFIGURED.SUPABASE_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', CONFIGURED.SUPABASE_SERVICE_ROLE_KEY);

  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (url.endsWith('/auth/v1/user')) {
      // Supabase says this token is somebody else's.
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'somebody-else' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;

  try {
    const response = await handler(request());

    assertEquals(response.status, 401);
    assertEquals(
      calls.some((url) => url.includes('/admin/users/')),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', previousUrl);
    if (previousKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousKey);
  }
});

Deno.test('does not treat a network failure as a valid token', async () => {
  const previousUrl = Deno.env.get('SUPABASE_URL');
  const previousKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  Deno.env.set('SUPABASE_URL', CONFIGURED.SUPABASE_URL);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', CONFIGURED.SUPABASE_SERVICE_ROLE_KEY);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error('network down'))) as typeof fetch;

  try {
    assertEquals((await handler(request())).status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', previousUrl);
    if (previousKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previousKey);
  }
});
