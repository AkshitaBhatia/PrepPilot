# ask-gemini

The AI proxy. PRD §15 requires the Gemini API key be server-side only, so this
function is the single place it exists — the app calls here, and this calls
Gemini.

## Deploying

```bash
supabase secrets set GEMINI_API_KEY=your-key
supabase functions deploy ask-gemini
```

Deploy it **with** JWT verification, which is the default. Do not pass
`--no-verify-jwt`: the rate limit below is keyed on the caller's verified
account, and without verification that claim is whatever the caller types.

The app checks for a configured Supabase project and a signed-in account, and
disables the assistant when either is missing, so nothing breaks before this is
deployed.

## The model

Pinned to `gemini-3.6-flash` rather than the `gemini-flash-latest` alias. An
alias that moves under a deployed function changes its answers, its cost and its
latency with nothing in this repository having changed.

Google does retire models: `gemini-2.5-flash` was pinned here until it began
refusing new callers outright with a 404 telling them to upgrade. Expect to
revisit this — but as an edit someone reviews, not silently.

Reasoning is capped at 512 thinking tokens. Uncapped, the model spent roughly
nine times as many tokens thinking as answering on a two-sentence question about
Ohm's law; the project owner pays for those and the student waits for them.

## What it guarantees

- **The key never reaches a client.** It is read from a Supabase secret at
  request time and is not included in any response.
- **Upstream errors are not forwarded.** A Gemini error body can contain quota or
  key detail, so failures are replaced with a generic message.
- **Requests are rate limited per account**, because the proxy spends the project
  owner's quota (`DECISIONS.md`, D29). The account comes from the verified
  token's `sub` claim, never from a request header — a header is whatever the
  caller types, and a single shared fallback would make twenty questions an hour
  a global limit rather than a personal one.
- **The reply is the answer, not the working.** A thinking model can return
  several parts and the first is not necessarily the answer, so parts the model
  marks as its own reasoning are dropped.
- **The browser can reach it.** The web build calls this cross-origin, so the
  preflight is answered; without that the request never leaves the browser.
- **The model cannot change the tracker.** It can only emit a proposal, which the
  app treats as inert until the student confirms it (PRD §14).

## Tests

```bash
pnpm test:functions
```

These run on Deno, not Node, so they are invisible to the workspace suite — CI
runs them as a separate step.
