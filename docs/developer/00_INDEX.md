# PrepPilot — Developer Documentation

Documentation of the system **as built**, required by PRD §25.

The specification in [`../`](../) describes what PrepPilot was meant to be and
remains the requirements baseline. These documents describe what exists, why it
was built that way, and where it falls short. Where the two disagree, the
disagreement is recorded here and in [`../../DECISIONS.md`](../../DECISIONS.md)
rather than quietly resolved in favour of the code.

| Document                           | Covers                                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module layout, dependency rules, why the shared package exists       |
| [DATABASE.md](DATABASE.md)         | Local and remote schemas, migrations, the columns sync depends on    |
| [STATE.md](STATE.md)               | Stores, what each owns, and what is deliberately derived             |
| [SYNC.md](SYNC.md)                 | The engine, conflict rules, and the failure modes they prevent       |
| [AI.md](AI.md)                     | The proxy, and how the assistant is prevented from changing anything |
| [SECURITY.md](SECURITY.md)         | RLS, secrets, session storage, what is not protected                 |
| [TESTING.md](TESTING.md)           | What is tested, how, and what tests cannot reach                     |
| [DEPLOYMENT.md](DEPLOYMENT.md)     | Running, building, and what must be configured first                 |
| [LIMITATIONS.md](LIMITATIONS.md)   | Everything not built, not verified, or knowingly compromised         |

## Reading order

For someone new to the code: **ARCHITECTURE → DATABASE → STATE → SYNC**. Those
four explain how a topic being ticked reaches a Postgres row.

For someone assessing the project: **LIMITATIONS** first. It is the honest list,
and every other document assumes it.

## The one-paragraph version

PrepPilot is an offline-first Expo application. The device's SQLite database is
the source of truth; Supabase is a synchronisation target, not a dependency.
Progress is always derived from rows, never stored. A shared TypeScript package
holds every pure decision — progress arithmetic, conflict resolution, timer
state, validation — so those rules are identical on every platform and testable
without a device.
