# PrepPilot — Security

## Authentication

Supabase Auth:

- Email/password
- Google
- Phone/OTP

## Authorization

Use Row Level Security so users only access their own records.

## Gemini

Gemini API keys must never be included in client applications.

Required:
Client → Secure Backend → Gemini

## Secrets

Use environment/server secret management.

Never commit:

- Gemini API key
- Supabase service-role key
- Production credentials

## Local Data

Use appropriate secure storage for sensitive local information.

## Account Deletion

Delete cloud and local user data according to the application's deletion policy.

## Input Security

Validate user inputs before persistence and API requests.
