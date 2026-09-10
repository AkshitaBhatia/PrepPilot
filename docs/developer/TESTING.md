# Testing

**1,020 tests** — 317 in `packages/shared`, 703 in `apps/mobile`.

| Package           | Runner                              | Why                                                             |
| ----------------- | ----------------------------------- | --------------------------------------------------------------- |
| `packages/shared` | Vitest                              | Pure TypeScript, no React Native                                |
| `apps/mobile`     | Jest + React Native Testing Library | The RN preset cannot run a pure package cleanly, and vice versa |

Coverage thresholds are enforced in CI: 95% statements, 90% branches, 95%
functions, 95% lines.

## What is tested against something real

**Repositories run the generated migrations against in-memory SQLite.** Both
`better-sqlite3` and `expo-sqlite` are synchronous Drizzle cores, so the tests
execute the SQL the app ships — constraints, cascades, indexes, ordering — rather
than a mock that agrees with whatever the code happens to do.

**Sync runs the real local database against an in-memory server** that behaves as
PostgREST does for upsert and filtered select.

**The server schema was applied to a real Postgres** and RLS isolation verified in
both directions.

**CI builds both bundles.** A green test suite does not prove the app still
bundles: Metro resolution through a pnpm workspace breaks independently of Jest,
and that is how two such failures were found.

## How tests are written

Queries go through **accessibility role and name** wherever possible, not test
IDs. A test that finds a button by its accessible name fails if the button stops
being reachable by a screen reader — so accessibility regressions are caught by
the ordinary suite rather than by a separate audit that never runs.

Several accessibility bugs were found exactly this way, including every modal in
the app announcing as a single button.

## Traps encountered

Recorded because each cost real time.

- **React Native's `Modal` renders its subtree twice**, and only the second copy
  has live press handlers. `getInModal` in `test-utils/render.tsx` handles it.
- **`expect(promise).rejects.toThrow()` is unreliable against a synchronous
  driver** — the promise is already rejected before the matcher attaches, failing
  roughly one run in six. `captureRejection` replaces it.
- **A `View` needs `accessible` to be queryable by role.** Adding it is usually
  the correct accessibility fix, not a test workaround.
- **Tests must not pin today's date.** Two did, and broke when the date rolled
  over. Pure helpers take their clock as a parameter; anything comparing against
  the real clock anchors to `Date.now()`.
- **`babel-preset-expo` inlines `EXPO_PUBLIC_*` at build time**, so mutating
  `process.env` in a test does nothing. Configuration is parsed by a pure
  function instead.

## What tests cannot reach

Everything native. Notification delivery, permission prompts, haptics,
`useKeepAwake`, keystore behaviour, and the suspend/resume cycle the timer is
designed around are all mocked.

This matters more than the coverage number suggests. The clearest example: the
app once opened its database without ever running its migrations, so no tables
existed. Every test passed, because the harness builds its own schema. Only
inspecting the client caught it.

See [LIMITATIONS.md](LIMITATIONS.md).
