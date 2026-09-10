/**
 * Account deletion.
 *
 * PRD §33 requires a student be able to delete their account. Removing the
 * `auth.users` row is a privileged operation — it needs the service-role key,
 * which must never reach a device — so it happens here, and only here.
 *
 * Everything the student owns is removed by the cascade: every synced table
 * references `auth.users (id) on delete cascade`, and `profiles` does too (D28).
 * There is deliberately no partial mode; a "delete my account" that leaves rows
 * behind is not a deletion.
 *
 * Deploy with:
 *   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...   # already present by default
 *   supabase functions deploy delete-account
 *
 * The account deleted is the one the token belongs to and can never be another:
 * no id is read from the request body, so there is nothing to tamper with.
 *
 * The token is checked against Supabase rather than merely decoded. Deploying
 * with `--no-verify-jwt` would otherwise turn this endpoint into "delete any
 * account you can name", because an unsigned JWT's `sub` is just text the
 * caller wrote. One deploy flag should not be all that stands between a
 * stranger and every account.
 */

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (
    options: { hostname?: string; port?: number },
    handler: (request: Request) => Promise<Response>,
  ) => unknown;
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * The account named by the bearer token, without checking the signature.
 *
 * A cheap first pass: it rejects a missing, malformed or non-user token before
 * any network call. It is deliberately **not** what the deletion acts on — see
 * `verifiedCallerId`, which asks Supabase whether the token is real.
 */
export function callerId(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const payload = token.split('.')[1];
  if (payload === undefined || payload.length === 0) return null;

  try {
    const normalised = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { sub?: unknown; role?: unknown };

    // An anon-key request carries `role: "anon"` and no user. Deleting on the
    // strength of that would let anyone with the publishable key delete accounts.
    if (claims.role === 'anon' || claims.role === 'service_role') return null;

    return typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : null;
  } catch {
    return null;
  }
}

/**
 * The account the token actually belongs to, according to Supabase.
 *
 * Deleting an account on the strength of a decoded claim trusts that the
 * platform verified the signature first. That is the default, but it is one
 * deploy flag away from being false, and the consequence — anyone deleting
 * anyone — is severe enough to be worth a round trip.
 *
 * Returns null for anything Supabase will not vouch for: a forged token, an
 * expired one, or the anon key, which identifies no user.
 */
export async function verifiedCallerId(
  request: Request,
  url: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;

  try {
    const response = await fetchImpl(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: header },
    });
    if (!response.ok) return null;

    const user = (await response.json()) as { id?: unknown };
    return typeof user.id === 'string' && user.id.length > 0 ? user.id : null;
  } catch {
    // A network failure must not be read as "the token is fine".
    return null;
  }
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (url === undefined || serviceKey === undefined || serviceKey.length === 0) {
    // Never say which piece of configuration is missing.
    return jsonResponse({ error: 'Account deletion is not configured.' }, 503);
  }

  // Cheap reject first, then the authoritative check. Both must name the same
  // account: a token whose claim disagrees with Supabase is not one to act on.
  const claimed = callerId(request);
  const userId = claimed === null ? null : await verifiedCallerId(request, url, serviceKey);
  if (userId === null || userId !== claimed) {
    return jsonResponse({ error: 'Sign in again to delete your account.' }, 401);
  }

  try {
    const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    });

    // 404 means the account is already gone. The student asked for it to not
    // exist, and it does not — reporting a failure would invite them to retry
    // something that already succeeded.
    if (!response.ok && response.status !== 404) {
      return jsonResponse({ error: 'We could not delete your account. Try again.' }, 502);
    }

    return jsonResponse({ deleted: true }, 200);
  } catch {
    return jsonResponse({ error: 'We could not reach the server. Try again.' }, 502);
  }
}

if (import.meta.main) {
  Deno.serve({}, handler);
}
