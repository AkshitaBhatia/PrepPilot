# Synchronisation

Implements PRD §22. The device is authoritative; the server is a copy.

## One pass

For each table, in dependency order — subjects, chapters, topics, sessions,
reminders — so a chapter never arrives before its subject:

1. **Pull** rows changed since the watermark
2. **Reconcile** them against local rows by id
3. **Merge** conflicts, writing the winner locally
4. **Push** everything still marked `pending`

### Pull before push

This ordering is the whole design, and getting it wrong is subtle.

Pushing first reads naturally — send my work, then collect theirs — but it
uploads a local row that has not been reconciled, overwriting whatever changed
elsewhere since the last sync. The first version of this engine did exactly that,
and a test caught it: a rename on one device silently reverted a tick made on
another.

Merging first means what gets pushed is already the agreed version.

## Conflict rules

Pure functions in `packages/shared/src/sync/merge.ts`, so both platforms resolve
identically.

| Situation                   | Winner                            | Reasoning                                                     |
| --------------------------- | --------------------------------- | ------------------------------------------------------------- |
| Either side tombstoned      | The tombstone, earliest timestamp | Resurrecting a deleted row is worse than losing an edit to it |
| `topics.completed` differs  | Later `completed_changed_at`      | Independent of renames                                        |
| Completion timestamps equal | **Completed**                     | Un-ticking finished work is unforgivable                      |
| Anything else               | Later `updated_at`                |                                                               |
| `updated_at` exactly equal  | **Local**                         | Otherwise a device rewrites rows it agrees with, forever      |

A merged row — one where neither side won whole — is written locally as `pending`
so the push carries it back. It exists nowhere else yet.

## The watermark

Stored per device in `preferences` as `sync.lastSyncedAt`.

**Rewound 60 seconds on every pull.** Device and server clocks differ, and a row
written moments before the last sync can carry a timestamp just before the
watermark. Re-pulling a minute of already-seen rows costs nothing — every write
is an idempotent upsert on a stable id — while missing one loses data silently.

**Advanced only on success.** A failed pass is retried in full rather than
skipping whatever it never reached.

## Failure and retry

Failures propagate; the store turns them into a message. A partial pass is always
safe to repeat, because every write is an upsert keyed on a client-generated id.

Retry is automatic on the transition back online, watched by `network-store` — not
on every network report, since the platform emits one when wifi merely switches to
cellular. A sync attempted while known-offline returns quietly rather than
failing, because failing loudly on every launch in a tunnel teaches a student to
ignore the message.

`Settings → Sync now` is the manual path.

## What does not sync

- `sync_status` — this device's own bookkeeping
- `notification_id` — identifies a scheduled notification on one device only
- `preferences` — device-local settings, including the watermark itself

## Testing

`sync-engine.test.ts` runs the real local database against an in-memory server
that behaves as PostgREST does for upsert and filtered select. It covers
tombstone propagation, the rename-versus-tick case, repeated passes not
duplicating, and a failed pass leaving rows pending.

The mapper's exact output was additionally verified against the real Postgres
schema under RLS, so the payload shape is known to be accepted rather than
assumed.

**Not yet verified:** a genuine two-device conflict against the hosted project.
That needs the schema pushed and two real sessions.
