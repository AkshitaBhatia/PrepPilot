# The AI assistant

Implements PRD §14 and §15. Secondary, online-only, and structurally incapable of
changing the tracker on its own.

## The key never reaches a client

```
app  →  Supabase Edge Function (ask-gemini)  →  Gemini
```

The Gemini key is a Supabase secret read at request time. Nothing in the app
knows it, and a key placed in client code would ship to every device that
installs the app — including as plain text in the web bundle.

The function also:

- **Never forwards an upstream error body.** A Gemini failure can carry key or
  quota detail; failures are replaced with a generic message.
- **Rate limits per user.** The proxy spends the project owner's quota, so an
  unlimited endpoint is a financial liability as much as a security one.

## The assistant cannot change anything

PRD §14 forbids the assistant marking topics complete, deleting topics, altering
the syllabus or imposing schedules. That is enforced by the data shape, not by
instructions in a prompt.

A reply is parsed into an inert **proposal**, and the proposal grammar has only
two verbs: `addChapters` and `addTopics`. There is no way to express deleting or
completing, so a model attempting it produces nothing parseable. A test asserts a
`deleteTopics` proposal parses to `null`.

```
reply → parse → proposal (inert) → student reviews → confirms → applied
```

Applying lists exactly what will be added first. A proposal over 200 topics is
refused outright: confirming hundreds of topics is a rubber stamp, not the review
§14 asks for.

## Unconfigured and offline are different

The assistant disables itself and says which it is, rather than accepting a
question and failing after the student has typed it:

- **No Supabase project** — "not set up yet"
- **Offline** — "needs an internet connection. Everything else keeps working
  offline."

## Deploying

```bash
supabase secrets set GEMINI_API_KEY=...
supabase functions deploy ask-gemini
```

Until then the assistant reports itself unavailable and nothing else is affected.
