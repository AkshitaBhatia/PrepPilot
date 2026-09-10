# Running the assistant without Supabase

The Gemini key must never reach a device (PRD §15), so something server-side has
to hold it. Normally that is the deployed Edge Function. Until a Supabase project
exists, the same file can be run locally instead — same code, no second
implementation to drift (D56).

## Two commands

```bash
# 1. Put the key in apps/mobile/.env (gitignored, never committed)
echo 'GEMINI_API_KEY=your-key' >> apps/mobile/.env
echo 'EXPO_PUBLIC_AI_PROXY_URL=http://127.0.0.1:8787' >> apps/mobile/.env

# 2. Run the proxy, and leave it running
pnpm ai:proxy
```

Then start the app as usual. The assistant, **Summarise** and **Test me on this**
all work — including in demo mode, which otherwise has no server to talk to.

Check it directly if you want to be sure:

```bash
curl -s -X POST http://127.0.0.1:8787 -H 'Content-Type: application/json' \
  -d '{"mode":"summarize","topicName":"Photosynthesis","subjectName":"Biology"}'
```

## What it is, exactly

`supabase/functions/ask-gemini/index.ts` run under Deno. `import.meta.main` is
true when the file is the entry point, so it starts a server; when Supabase
imports it as a function, or a test imports the handler, it does not.

It binds to **127.0.0.1** deliberately — only this machine can reach it, which is
why it answers requests with no account attached. Deployed, that stays off unless
`ALLOW_ANONYMOUS_AI` is set explicitly.

`AI_PROXY_PORT` changes the port if 8787 is taken.

## Why the key is not simply put in the app

It would be in the bundle. `EXPO_PUBLIC_*` values are inlined at build time and
readable by anyone with the APK or the web build — that is the whole reason the
proxy exists. The key stays in a gitignored `.env`, read by a process on your
machine, and never crosses into anything shipped.

## Moving to the deployed function

Delete `EXPO_PUBLIC_AI_PROXY_URL` and deploy:

```bash
supabase secrets set GEMINI_API_KEY=your-key
supabase functions deploy ask-gemini
```

The app then routes through Supabase and attributes each request to the
signed-in account, which is what the per-account rate limit is for.
