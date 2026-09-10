import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../../lib/supabase';
import { toIso, type Remote, type RemoteRow, type SyncedTable } from './remote';

/**
 * The Supabase implementation of the remote.
 *
 * Every request is made with the signed-in student's own token, so Row Level
 * Security is what actually scopes the data — this code never adds a `user_id`
 * filter of its own and could not widen access if it tried.
 */
export function createSupabaseRemote(client: SupabaseClient = getSupabase()): Remote {
  return {
    async pull(table, since) {
      let query = client.from(table).select('*');

      // Pulling only what changed keeps a routine sync small; the first sync on
      // a new device passes null and takes everything.
      if (since !== null) query = query.gte('updated_at', toIso(since));

      const { data, error } = await query;
      if (error !== null) throw new Error(`pull ${table}: ${error.message}`);

      return (data ?? []) as RemoteRow[];
    },

    async push(table, rows) {
      if (rows.length === 0) return;

      // Upsert by primary key: a row created offline and pushed twice must
      // update rather than duplicate (PRD §22).
      const { error } = await client.from(table).upsert(rows as never[], { onConflict: 'id' });
      if (error !== null) throw new Error(`push ${table}: ${error.message}`);
    },
  };
}

export type { Remote, RemoteRow, SyncedTable };
