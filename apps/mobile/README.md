# @preppilot/mobile

The PrepPilot Android application — Expo SDK 57, React Native 0.86, Expo Router.

## Running it

From the repository root:

```bash
pnpm install
```

Then, from this directory:

```bash
pnpm start
```

The landing screen is the **Tracker** — the app's primary screen — showing the
`Subject → Chapter → Topic` hierarchy. The design-system gallery is still
available at `/design-system` for reviewing primitives on a device.

## Why a development build, not Expo Go

Google Sign-In, Focus Mode and reliable exact alarms all need native modules that
Expo Go does not bundle, so the app is built with EAS development builds
(`DECISIONS.md`, D10). The gallery screen happens to run in Expo Go today; the
authentication and Focus Mode work in later phases will not.

## Configuration

Copy `.env.example` to `.env` and fill in your Supabase project URL and anon key.
The app fails at start-up with an actionable message if either is missing, rather
than surfacing the problem later as an opaque network error.

Only `EXPO_PUBLIC_*` values belong in `.env` — everything there is compiled into
the bundle and readable by anyone who downloads the app. The Supabase **anon key
is safe here**: it is a publishable identifier whose reach is bounded by Row Level
Security. The **service-role key and the Gemini key are not**, and must never
appear under `apps/`.

Two flows are feature-flagged because they are implemented but not yet
provisioned (`DECISIONS.md`, D26):

| Flag                               | Enables        | Needs                                                        |
| ---------------------------------- | -------------- | ------------------------------------------------------------ |
| `EXPO_PUBLIC_ENABLE_PHONE_OTP`     | Phone sign-in  | A Supabase SMS provider; DLT registration for Indian numbers |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google sign-in | A Google OAuth client and a development build                |

Both stay hidden rather than failing when tapped.

## Authentication

Sign-in is required before the tracker is reachable (D1), enforced in one place:
the `(app)` route group redirects to `/login` whenever there is no session, and
the `(auth)` group redirects away once there is one.

`AuthGate` restores any stored session _before_ the first route renders. Without
it, the route guards would evaluate while the status is still `initialising` and
an already-signed-in student would see the Login screen flash before being
redirected off it.

Sessions live in the device keystore via `expo-secure-store`, never in plain
storage — a refresh token grants access to the account. `expo-secure-store`
rejects values over 2048 bytes and a Supabase session routinely exceeds that, so
the storage adapter chunks values on code-point boundaries and reassembles them,
discarding a partially written entry rather than returning a corrupt session.

Supabase's own error strings never reach a student. `auth-errors.ts` maps known
codes to plain messages and falls back for anything unrecognised, so a database
error can't surface as UI text.

## Design system

Components live in `src/components/ui` and read every value — colour, spacing,
radius, type scale — from `@preppilot/shared`. Nothing hardcodes a colour or a
pixel value, so the web demo and the app cannot drift apart.

| Component                                       | Role in the product                                   |
| ----------------------------------------------- | ----------------------------------------------------- |
| `ProgressRing`                                  | The circular meter on subject cards                   |
| `ProgressBar`                                   | The horizontal meter for chapters and topics          |
| `Checkbox`                                      | The circular topic checkbox                           |
| `PlayButton`                                    | Opens a timer for a subject, chapter or topic         |
| `StatChip`                                      | Dashboard and timer figures ("Time Spent", "20h 11m") |
| `Card`, `Screen`, `Text`, `Button`, `TextField` | Layout and input primitives                           |
| `EmptyState`, `LoadingState`, `ErrorState`      | The three states every screen needs                   |

### Accessibility

The success matrix marks accessibility Critical, so the primitives enforce it
rather than leaving it to each screen:

- Progress is **never** conveyed by colour or arc length alone — the percentage is
  always rendered as text, and the control exposes `accessibilityValue`.
- An unmeasurable scope announces "No topics yet" rather than "0%", matching the
  em dash shown on screen.
- The 24dp checkbox expands its touch target with `hitSlop` to reach the 44dp
  minimum; buttons enforce that minimum in their own height.
- A loading button is `disabled` and `busy`, so a double tap cannot submit twice.

## Theming

`ThemeProvider` resolves the mode in this order: an explicit user choice, then the
device setting, then dark. It backstops with dark rather than light because
`useColorScheme` returns `null` before the native module reports in, and falling
back to light would flash a white screen on a dark-themed device.

## Testing

```bash
pnpm test           # Jest + React Native Testing Library
pnpm test:coverage  # enforces the coverage thresholds CI checks
```

Tests query by accessibility role and name rather than by test ID wherever
possible, so they fail if a control stops being reachable by a screen reader.
