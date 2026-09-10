import type { SupabaseClient } from '@supabase/supabase-js';
import { toIso, type RemoteRow } from '../remote';
import { createSupabaseRemote } from '../supabase-remote';

interface Recorded {
  readonly table: string;
  readonly gte: readonly [string, string][];
  readonly upserts: readonly { rows: unknown; options: unknown }[];
}

/**
 * A stand-in for the PostgREST query builder.
 *
 * The real client cannot be exercised without a network and a signed-in
 * session, but what this module is responsible for is the shape of the request
 * it builds — which filter it adds, and which conflict target it upserts on.
 */
function fakeClient(result: { data?: unknown[] | null; error?: { message: string } } = {}) {
  const recorded: { table: string | null; gte: [string, string][]; upserts: unknown[][] } = {
    table: null,
    gte: [],
    upserts: [],
  };

  const response = {
    data: result.data === undefined ? [] : result.data,
    error: result.error ?? null,
  };

  const builder = {
    select: () => builder,
    gte: (column: string, value: string) => {
      recorded.gte.push([column, value]);
      return builder;
    },
    upsert: (rows: unknown, options: unknown) => {
      recorded.upserts.push([rows, options]);
      return Promise.resolve({ error: response.error });
    },
    then: (resolve: (value: typeof response) => unknown) => resolve(response),
  };

  const client = {
    from: (table: string) => {
      recorded.table = table;
      return builder;
    },
  } as unknown as SupabaseClient;

  const seen = (): Recorded => ({
    table: recorded.table ?? '',
    gte: recorded.gte,
    upserts: recorded.upserts.map(([rows, options]) => ({ rows, options })),
  });

  return { client, seen };
}

describe('pulling', () => {
  it('asks only for what changed since the last sync', async () => {
    const { client, seen } = fakeClient({ data: [{ id: 'a' }] });
    const since = Date.UTC(2026, 7, 20, 9, 30);

    const rows = await createSupabaseRemote(client).pull('subjects', since);

    expect(rows).toEqual([{ id: 'a' }]);
    expect(seen().table).toBe('subjects');
    expect(seen().gte).toEqual([['updated_at', toIso(since)]]);
  });

  it('takes everything on a device that has never synced', async () => {
    const { client, seen } = fakeClient({ data: [] });

    await createSupabaseRemote(client).pull('topics', null);

    expect(seen().gte).toEqual([]);
  });

  it('reports which table failed, without a row of its own', async () => {
    const { client } = fakeClient({ error: { message: 'permission denied' } });

    await expect(createSupabaseRemote(client).pull('topics', null)).rejects.toThrow(
      'pull topics: permission denied',
    );
  });

  it('treats a missing body as no rows rather than a crash', async () => {
    const { client } = fakeClient({ data: null });
    // PostgREST can answer with a null body; that is an empty result, not a fault.
    const remote = createSupabaseRemote(client);

    await expect(remote.pull('chapters', null)).resolves.toEqual([]);
  });
});

describe('pushing', () => {
  it('upserts on the primary key, so a row pushed twice never duplicates', async () => {
    const { client, seen } = fakeClient();
    const rows: RemoteRow[] = [
      {
        id: 'topic-1',
        user_id: 'user-1',
        updated_at: '2026-08-20T09:30:00.000Z',
        deleted_at: null,
      },
    ];

    await createSupabaseRemote(client).push('topics', rows);

    expect(seen().upserts).toEqual([{ rows, options: { onConflict: 'id' } }]);
  });

  it('makes no request when there is nothing to send', async () => {
    const { client, seen } = fakeClient();

    await createSupabaseRemote(client).push('topics', []);

    expect(seen().upserts).toEqual([]);
    expect(seen().table).toBe('');
  });

  it('reports which table failed', async () => {
    const { client } = fakeClient({ error: { message: 'row violates row-level security' } });

    await expect(
      createSupabaseRemote(client).push('study_sessions', [
        {
          id: 'session-1',
          user_id: 'user-1',
          updated_at: '2026-08-20T09:30:00.000Z',
          deleted_at: null,
        },
      ]),
    ).rejects.toThrow('push study_sessions: row violates row-level security');
  });
});
