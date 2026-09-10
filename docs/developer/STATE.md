# State

Zustand, one store per feature. Stores orchestrate; they do not hold anything
that can be computed.

| Store             | Owns                                 | Notes                                         |
| ----------------- | ------------------------------------ | --------------------------------------------- |
| `auth-store`      | Session, user, auth errors           | `initialising` is distinct from `signedOut`   |
| `tracker-store`   | The syllabus tree and its progress   | Progress is recomputed, never patched         |
| `timer-store`     | Current timer, the recording session | Elapsed time is derived from timestamps       |
| `focus-store`     | Focus session, distraction count     |                                               |
| `dashboard-store` | Dashboard figures                    | Derived from one read                         |
| `history-store`   | Session list                         |                                               |
| `reminders-store` | Reminders and permission state       | Owns notification scheduling                  |
| `templates`       | —                                    | Stateless; the screen holds its own selection |
| `ai-store`        | Conversation, pending proposal       | A proposal is inert until confirmed           |
| `sync-store`      | Sync status, watermark               |                                               |
| `network-store`   | Connectivity                         | Triggers sync on reconnect                    |

## Three patterns worth knowing

### `initialising` is not `signedOut`

On launch the app does not yet know whether a stored session exists. Collapsing
that into "signed out" makes the Login screen flash at someone who is already
signed in, for as long as the keystore read takes.

`AuthGate` holds the first render until the answer is known.

### Derived data is never stored

`tracker-store` keeps rows and recomputes progress after every mutation. It would
be cheaper to adjust a counter when a topic is ticked, and that is exactly the
optimisation that eventually shows a wrong percentage with nothing to detect it.

The same applies to the timer: elapsed time is `now - startedAt + banked`, not a
value incremented on a tick. A counter stops when Android suspends the process,
and would silently under-report every session where a student locked their screen.

### Stores turn failures into sentences

No store lets a driver or transport error reach a screen. `SQLITE_BUSY`,
`AuthApiError`, a PostgREST constraint name — each is mapped to something a
student can act on, and there are tests asserting the raw text never appears.

## Context injection

`timer-store`, `focus-store` and `tracker-store` take their user id, repositories
and clock through a `configure`/`load` call rather than importing them.

That is what makes them testable: a test supplies a real in-memory database and a
clock it controls, and can advance time by an hour without waiting. It also means
using a store before configuring it fails with a sentence naming the missing call,
instead of a null dereference deep inside a query.
