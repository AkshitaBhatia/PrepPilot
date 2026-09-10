# PrepPilot

**Offline-first study tracking for students.** Organise a syllabus as
`Subject → Chapter → Topic`, check off what you have actually finished, time your
study sessions, and see honest progress — with or without an internet connection.

> **Tracker first, AI second.** Gemini assistance supports the workflow; it never
> drives it, and it never changes your syllabus without your confirmation.

## Status

Early development. See [`DECISIONS.md`](DECISIONS.md) for the decisions this
implementation is built on and [`docs/`](docs/) for the full specification.

| Phase                                                                 | Status         |
| --------------------------------------------------------------------- | -------------- |
| 0 — Foundation (monorepo, tooling, CI)                                | ✅ Done        |
| 0 — Progress engine + design tokens                                   | ✅ Done        |
| 1 — Expo app + design system components                               | ✅ Done        |
| 2 — Authentication                                                    | ✅ Done        |
| 3 — Offline tracker: data layer (SQLite + Drizzle)                    | ✅ Done        |
| 3 — Offline tracker: UI                                               | ✅ Done        |
| 5 — Timers and study sessions                                         | ⏳ Next        |
| 6–14 — Dashboard, templates, sync, notifications, AI, Focus Mode, web | ⬜ Not started |

## Repository layout

```
apps/
  mobile/          Expo + React Native app (Android primary)   — auth, DB, design system
  web/             Vite + React demonstration UI               — not yet created
packages/
  shared/          Progress engine, design tokens, formatters  — implemented
supabase/          Migrations, RLS policies, Edge Functions    — profiles + RLS
docs/              Product, technical and design specification
```

`packages/shared` is deliberately framework-agnostic: the mobile app and the web
demo compute progress with the _same_ code and render it with the _same_ tokens,
so the two can never disagree about a percentage or a colour.

## Getting started

Requires Node 22 (see [`.nvmrc`](.nvmrc)) and pnpm 10+.

```bash
pnpm install
```

**To try the app in a browser**, with no backend required:

```bash
pnpm --filter @preppilot/mobile web:demo
```

Then open <http://localhost:8081>. This runs in **demo mode** (`DECISIONS.md`,
D40): a fixed local account, no Supabase, a small seeded syllabus, and a banner
on every screen saying the session is local and unauthenticated. The tracker,
timers and history are all real — they run against SQLite compiled to
WebAssembly — but nothing syncs.

For the Android app:

```bash
pnpm --filter @preppilot/mobile start
```

| Command              | What it does                                |
| -------------------- | ------------------------------------------- |
| `pnpm test`          | Run all tests                               |
| `pnpm test:coverage` | Run tests with coverage thresholds enforced |
| `pnpm typecheck`     | Type-check every package                    |
| `pnpm format`        | Format with Prettier                        |
| `pnpm format:check`  | Verify formatting (runs in CI)              |

## The progress engine

Progress is the product's core promise, so it lives in one place, is pure, and is
tested exhaustively.

```ts
import { calculateSyllabusProgress, formatPercent } from '@preppilot/shared';

const { overall, bySubject, byChapter } = calculateSyllabusProgress(subjects);

formatPercent(overall); // "50%"
formatPercent(overall, { precision: 2 }); // "50.00%"
```

Two rules it exists to enforce:

**Subject progress is topic-weighted.** A subject with a 1-of-1 chapter and a
0-of-99 chapter is **1%** complete, not 50%. Averaging chapter percentages — the
obvious and wrong implementation — is guarded by an explicit regression test.

**Nothing to measure is not zero.** A chapter with no topics reports
`percent: null` and renders as `—`. Rounding is likewise honest: 9,999 of 10,000
topics displays as `99%`, never a falsely triumphant `100%`.

## Security

The Gemini API key and the Supabase service-role key are **server-side only**,
never bundled into the app or the web build. All user data is isolated with
Supabase Row Level Security. See [`docs/SECURITY.md`](docs/SECURITY.md).

## Documentation

Two sets, kept separate because they answer different questions.

[`docs/`](docs/) is the **specification** — what PrepPilot was meant to be, and
the baseline it is assessed against. Start at
[`docs/00_DOCUMENTATION_INDEX.md`](docs/00_DOCUMENTATION_INDEX.md).

[`docs/developer/`](docs/developer/) documents the system **as built**: how it
works, why it was built that way, and where it falls short. Start at
[`docs/developer/00_INDEX.md`](docs/developer/00_INDEX.md), or go straight to
[`docs/developer/LIMITATIONS.md`](docs/developer/LIMITATIONS.md) for the honest
list of what is unbuilt and unverified.
The [PRD](docs/PRD.md) is the authoritative product specification; where this
implementation departs from or extends it, [`DECISIONS.md`](DECISIONS.md) says so
and explains why.
