# PrepPilot — Technical Architecture

## High-Level Architecture

Android Client
→ Local Database
→ Sync Layer
→ Supabase

AI:
Client
→ Secure Backend/API
→ Gemini API

## Core Stack

- React Native
- Expo
- TypeScript
- Expo Router
- Zustand or equivalent
- Mobile local database
- Supabase
- PostgreSQL
- Supabase Auth
- Gemini API
- Secure backend
- Modern web stack

## Local Database

Stores:

- Subjects
- Chapters
- Topics
- Study sessions
- Reminders
- Preferences
- Sync metadata

## Supabase

Suggested tables:

- profiles
- subjects
- chapters
- topics
- study_sessions
- reminders
- templates
- user_template_imports
- user_preferences

## Authentication

Supabase Auth:

- Email/password
- Google
- Phone/OTP

## Security

- RLS
- Server-side secrets
- Environment variables
- Input validation
- Authorization
- User isolation

## Synchronization

- Stable IDs
- Local change tracking
- Upload queue
- Download changes
- Retry handling
- Conflict strategy
- Duplicate prevention

## AI

Gemini key must never be in client code.

Client → backend → Gemini.

AI is optional and online-only.

## Focus Mode

Use supported Android APIs and permissions. Document limitations.

## Web

Web version is primarily a display/demo application sharing the product design language.
