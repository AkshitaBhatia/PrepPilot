# Architecture

## Shape

```
apps/
  mobile/          Expo + React Native. Android is the target; the same build runs in a browser.
packages/
  shared/          Pure TypeScript. No React, no React Native, no I/O.
supabase/
  migrations/      The server schema.
  functions/       Edge Functions. Currently only the Gemini proxy.
```

## The dependency rule

`packages/shared` depends on nothing. Not React, not React Native, not the
database, not the network.

That constraint is the reason the package exists. Everything in it is a decision
the product must make identically everywhere — what 3 of 10 topics means as a
percentage, which of two conflicting edits wins, whether a countdown has expired
— and keeping it free of I/O means those decisions can be tested exhaustively in
milliseconds, without a simulator.

It also means the browser build and the Android build cannot disagree about a
number. They run the same functions.

### What lives there

| Module                       | Responsibility                                  |
| ---------------------------- | ----------------------------------------------- |
| `progress/`                  | The percentage arithmetic and its formatting    |
| `sync/`                      | Conflict resolution                             |
| `timer/`                     | Timer state machine for all three modes         |
| `reminders/`                 | Next-occurrence calculation for repeat rules    |
| `stats/`                     | Dashboard aggregations, streaks, day bucketing  |
| `templates/`                 | Template shape, validation, the bundled library |
| `ai/`                        | Parsing a model reply into an inert proposal    |
| `auth/`                      | Input validation                                |
| `id/`                        | UUIDv7 generation                               |
| `time/`, `theme/`, `domain/` | Formatting, design tokens, structural types     |

## Layers in the app

```
screens          features/*/[name]-screen.tsx
   │  render, and translate taps into store calls
stores           features/*/[name]-store.ts        (Zustand)
   │  orchestrate; hold no derived data
repositories     db/repositories/*.ts              (Drizzle)
   │  every SQL statement in the app
database         expo-sqlite (device) · sql.js (browser)
```

A screen never touches a repository directly, and a repository never knows a
screen exists. The stores are the only place the two meet.

### Why the browser build has a different driver

`expo-sqlite` runs wa-sqlite in a worker on web, which needs `SharedArrayBuffer`,
OPFS and `Atomics.wait` — in practice cross-origin isolation headers and a worker
handshake that times out under ordinary hosting. `sql.js` is plain WebAssembly on
the main thread with none of those requirements.

Only `db/client.web.ts` differs. The schema, migrations and every repository are
shared, so the browser runs the same SQL the Android app runs.

## Progress is derived, never stored

There is no `progress` column anywhere. Every percentage is computed from topic
rows at read time by `calculateSyllabusProgress`, which produces the chapter,
subject and overall figures in a single traversal.

Storing progress would mean maintaining it on every write — and the first missed
update would leave a student looking at a number that is quietly wrong, with
nothing to detect it. Deriving costs a linear pass over topics, which for a
syllabus of any realistic size is not measurable.

The same function serves the Tracker and the Dashboard, so the two cannot
disagree.

## Related

- [DATABASE.md](DATABASE.md) — what the rows look like
- [STATE.md](STATE.md) — what each store owns
- [`../../DECISIONS.md`](../../DECISIONS.md) — D7, D8, D30, D59 cover these choices
