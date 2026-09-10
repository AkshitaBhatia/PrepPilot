# delete-account

Removes a student's account. PRD §33 requires it; the client SDK cannot do it,
because deleting an `auth.users` row needs the service-role key and that key must
never reach a device (`DECISIONS.md`, D28).

## Deploying

```bash
supabase functions deploy delete-account
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions
by the platform, so there is no secret to set by hand.

Deploy it **with** JWT verification, which is the default. Never
`--no-verify-jwt`: the account deleted is the one named by the caller's verified
token, and without verification that claim is whatever the caller types.

## What it guarantees

- **It deletes only the caller's own account.** No id is read from the request
  body — there is nothing to tamper with. A body naming somebody else is ignored.
- **A publishable-key request cannot delete anything.** An anon token carries
  `role: "anon"` and names no user, so it is refused; otherwise anyone holding
  the public key could delete accounts.
- **The service-role key never appears in a response.** An upstream error body
  can quote it, so failures are replaced with a generic message.
- **Everything the student owns goes with the account**, through the
  `on delete cascade` from `auth.users` on `profiles` and every synced table.
- **Deleting twice is not an error.** A 404 means the account is already gone,
  which is what was asked for.

## Ordering, and why the device is cleared first

The app tombstones the device copy _before_ calling this. A failure then leaves
the device clear and the account intact, which the student can retry. The other
order would leave the account gone and the data still on the phone, with nothing
left to authenticate the retry.

## Tests

```bash
pnpm test:functions
```
