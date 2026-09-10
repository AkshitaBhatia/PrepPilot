# Limitations

Everything not built, not verified, or knowingly compromised. Read this before
the other documents.

## Not verified on hardware

**Nothing in this project has run on an Android device.** Every feature is
verified by tests and in a browser.

The gap is not evenly distributed. These are mocked and unproven:

- Notification delivery, scheduling accuracy, permission prompts
- `useKeepAwake` during a focus session
- Haptics
- Keystore reads and writes, including the chunked session adapter
- `AppState` transitions — which the timer's entire design targets
- The SQLite pragmas (`foreign_keys`, WAL) actually applying

**Why this matters more than the coverage number suggests:** the app once opened
its database without ever running its migrations, so no tables existed. Every
test passed, because the test harness builds its own schema. A browser cannot
catch that class of problem either.

One EAS development build would close most of this.

## Not built

| Item                     | Blocked on                   | Notes                                                                         |
| ------------------------ | ---------------------------- | ----------------------------------------------------------------------------- |
| Real syllabus templates  | Verified content             | The import flow works; the library holds two examples, both marked unverified |
| Google sign-in           | An OAuth client              | Configuration is wired; the native flow is not implemented                    |
| Phone OTP                | An SMS provider              | Implemented end to end, behind a flag, untested against real delivery         |
| The AI assistant working | A Gemini key                 | Client and proxy are built; the function is not deployed                      |
| Cloud account deletion   | A service-role Edge Function | Local deletion works and says plainly that the server copy remains            |
| Drag-to-reorder          | —                            | Repositories support reorder; the UI offers up/down from a menu               |

## Knowingly compromised

**Focus Mode cannot block apps.** Android does not permit it without an
AccessibilityService or device-admin privileges, both restricted by Play Store
policy. It counts departures instead, and says so in an in-app capability list.

**Do Not Disturb is not toggled.** It needs a permission no Expo module exposes.

**Weekday reminders are re-armed by the app**, since neither platform has a
weekday-only trigger. If the app is never opened, they stop firing.

**The local database is not encrypted.**

**Demo mode bypasses authentication entirely.** Gated behind an explicit flag,
labelled on every screen, never on by default.

## Not fully validated

**Sync has not run against the hosted project.** The engine is tested against a
real local database and an in-memory server, and the payload shape was verified
against real Postgres under RLS — but a genuine two-device conflict has not been
observed end to end.

**The RLS claims are verified by the tests described in SECURITY.md**, which is
not the same as a security audit.

**The `subtopics` and `flashcards` migration has not been run against Postgres.**
The earlier tables were checked against a real database — which is how the
missing `GRANT` was found — but Docker was unavailable when these were written,
so their policies are written by analogy rather than verified. Run
`supabase db push` against a branch before trusting them.

**Sub-topics change what a percentage counts.** A topic broken into parts
contributes those parts, so the same syllabus reports a different figure after
one is added. That is deliberate — a four-part topic is four times the work —
but a student watching the number will see it move when they add a sub-topic
without completing anything.

## Where the code departs from the specification

Each is recorded with reasoning in [`../../DECISIONS.md`](../../DECISIONS.md):

- **D1** — sign-in is required, so "offline-first" means _after the first sign-in_
- **D33** — "field-level" conflict resolution is implemented for the two fields
  that can actually conflict independently, not per column
- **D48** — Focus Mode delivers a subset of what D22 described
- **D51** — templates ship as examples rather than the 10+ named syllabi PRD §13
  requires; JEE Main, JEE Advanced and NEET UG are now real, the CBSE streams
  are not yet
- **D53** — account deletion now removes the server account through the
  `delete-account` Edge Function; until that function is deployed the app clears
  the device and says plainly that the account itself remains
