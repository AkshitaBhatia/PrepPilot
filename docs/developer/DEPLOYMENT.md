# Running and deploying

## Requirements

Node 22 (see `.nvmrc`), pnpm 10+. Docker and the Supabase CLI for server work.

```bash
pnpm install
```

## Trying it without a backend

```bash
pnpm --filter @preppilot/mobile demo
```

Builds the web bundle and serves it at <http://localhost:8081> in **demo mode**:
a fixed local account, no Supabase, a small seeded syllabus, and a banner on
every screen stating the session is local and unauthenticated.

The tracker, timers, history and reminders are all real — they run against SQLite
compiled to WebAssembly. Nothing syncs.

The server sets `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`
because SQLite in the browser needs cross-origin isolation. Expo's own dev server
does not set them, which is why `serve:web` exists rather than `expo start --web`.

## Running against Supabase

Copy `.env.example` to `apps/mobile/.env` and fill in:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...      # the publishable key
```

Then apply the schema — **this has to happen before the app can do anything with
the server**:

```bash
supabase link --project-ref <ref>
supabase db push
```

```bash
pnpm --filter @preppilot/mobile start   # Android, via a development build
```

## Why a development build, not Expo Go

Google Sign-In, Focus Mode's keep-awake, and reliable exact alarms need native
modules Expo Go does not bundle. The browser build happens to run without one;
the Android app does not.

## Optional configuration

| Variable                           | Enables                | Also needs                                                   |
| ---------------------------------- | ---------------------- | ------------------------------------------------------------ |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google sign-in visible | A Google OAuth client                                        |
| `EXPO_PUBLIC_ENABLE_PHONE_OTP`     | Phone sign-in          | A Supabase SMS provider; DLT registration for Indian numbers |
| `EXPO_PUBLIC_DEMO_MODE`            | Demo mode              | Nothing — must be exactly `"true"`                           |

Both feature-flagged flows are implemented and tested but stay hidden until
provisioned: a broken button is worse than an absent one.

### Enabling Google sign-in

1. Create a Google OAuth client and enable the Google provider in Supabase
   (Authentication → Providers), pasting the client ID and secret there.
2. Add the app's redirect to Supabase's allow list under Authentication → URL
   Configuration. The native redirect is `preppilot://auth/callback`; the web
   build additionally needs `<origin>/auth/callback` for wherever it is served.
   Supabase rejects a redirect that is not on this list, and the failure looks
   like the browser closing with nothing happening.
3. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` so the button appears.

Sign-in runs through the system browser rather than a WebView, because Google
refuses to authenticate inside one. That means Android needs a development
build — the redirect back into the app cannot resolve under Expo Go.

## Building the web bundle

```bash
pnpm --filter @preppilot/mobile build:web
```

Always with `--clear`, which that script passes. `EXPO_PUBLIC_*` values are
inlined into the bundle at transform time, and Metro's cache keeps the
transformed module — so a build that changes one of them and reuses the cache
silently ships the _previous_ build's value. That was observed here: a
production export reused a demo build's cache and came out still flagged as
demo mode, with the real Supabase URL absent. Nothing warns you; the only symptom
is an app behaving as though it were built with different settings.

## The AI proxy

```bash
supabase secrets set GEMINI_API_KEY=...
supabase functions deploy ask-gemini
```

Deploy it **with** JWT verification, which is the default — never
`--no-verify-jwt`. The proxy's rate limit is keyed on the caller's account, read
from the verified token's `sub` claim; without verification that claim is
whatever the caller types, and the limit stops meaning anything.

The key must be a Google AI Studio API key, which begins `AIza` and does not
expire. Google also issues short-lived tokens beginning `AQ.` for client-side
use; one of those authenticates identically today and then stops working, with
the only symptom being the assistant answering every question with a generic
failure.

The model is pinned in `supabase/functions/ask-gemini/index.ts` rather than
tracking an alias, and Google retires models — see that function's README.

## Letting the demo use the assistant

The browser demo has no account, and the proxy answers only a request carrying a
token — every reply spends the project owner's Gemini quota. To let the demo ask
anyway:

```bash
supabase secrets set ALLOW_ANONYMOUS_AI=true
```

and set `EXPO_PUBLIC_ALLOW_ANONYMOUS_AI=true` plus the Supabase URL and key in
the app's environment, even for a demo build.

**Understand the exposure before switching it on.** The Edge Function lives at a
public URL on Supabase. Running the app on localhost keeps the _page_ private; it
does nothing for the _endpoint_. Anyone who finds that URL can call it. The proxy
therefore caps every anonymous caller together at 60 requests an hour, rather
than per account — a global budget, not a personal one. Turn it off when the
demo is over.

## Account deletion

```bash
supabase functions deploy delete-account
```

Needs no secrets — the platform injects `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Deploy it **with** JWT verification, as with the AI
proxy: the account it deletes is the one the verified token names, and there is
no id in the request body to point it anywhere else.

Until it is deployed, the app still clears the device and tells the student
plainly that the account itself remains — it never reports a deletion it could
not verify.

## Development procedures

| Command                        | What it does                                |
| ------------------------------ | ------------------------------------------- |
| `pnpm test`                    | Every test                                  |
| `pnpm test:coverage`           | With thresholds enforced — **what CI runs** |
| `pnpm typecheck`               | Both packages                               |
| `pnpm format` / `format:check` | Prettier                                    |

Before pushing, run `pnpm test:coverage`, not `pnpm test`. They differ, and CI
runs the former — a coverage drop has slipped through more than once because only
`test` was run locally.

### Changing the schema

1. Edit `apps/mobile/src/db/schema.ts`
2. `pnpm --filter @preppilot/mobile exec drizzle-kit generate`
3. Write the matching `supabase/migrations/` file **with its `GRANT`**
4. `supabase db reset` against the local stack to verify it applies
5. Add the table to `SYNCED_TABLES` if it should sync

Never edit a generated migration.

### CI

Format, typecheck, tests with coverage, then an Android **and** a web bundle. The
bundle steps exist because Metro resolution breaks independently of Jest, and a
green suite has twice accompanied an app that could not build.
