# Installing PrepPilot on an Android phone

Expo Go cannot run this app and will not be able to: it bundles one SDK version
at a time, currently 54, and PrepPilot is on 57. Nothing here downgrades the SDK.

A standalone APK sidesteps the problem entirely — the runtime ships **inside**
the APK, so the phone needs no Expo Go and no matching SDK. This is the intended
way to run it on a device.

## The short version

```bash
cd apps/mobile && npx eas login && npx eas init && pnpm apk
```

EAS builds it in the cloud (roughly 10–20 minutes for a first build) and prints a
URL plus a QR code. Open that on the phone, download, install. Android will ask
you to allow installing from that browser the first time.

## The steps, and what each is for

**1. An Expo account.** Free, and the only thing that cannot be done for you —
it is your account and your credentials.

```bash
cd apps/mobile
npx eas login
```

**2. Register the project.** Writes an `extra.eas.projectId` into `app.json`,
linking this checkout to a project on your account. Commit that change.

```bash
npx eas init
```

**3. Build.**

```bash
pnpm apk          # demo build: local database, no sign-in, seeded data
pnpm apk:live     # real build: signs in against Supabase and syncs
```

Use `pnpm apk` first. It needs nothing else configured, and it exercises the
whole app — tracker, sub-topics, notes, timers, flashcards, reminders — against
a local database. `pnpm apk:live` additionally needs the migrations applied and
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` set as EAS secrets:

```bash
npx eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value https://…
npx eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value sb_publishable_…
```

## The profiles

| Profile        | Output | For                                                                               |
| -------------- | ------ | --------------------------------------------------------------------------------- |
| `preview`      | `.apk` | Installing on a phone. Demo mode, no backend needed.                              |
| `preview-live` | `.apk` | The same, against the real Supabase project.                                      |
| `development`  | `.apk` | A development client — loads JS from Metro, so changes appear without rebuilding. |
| `production`   | `.aab` | The Play Store. **Not installable directly on a phone.**                          |

The distinction that matters: `.apk` installs by download, `.aab` does not. That
is why `preview` exists rather than using `production` for testing.

## Building without an Expo account

Possible, but it needs the Android SDK on this machine — roughly 1–2 GB of
command-line tools, a platform and build-tools, plus a JDK that Gradle accepts
(this machine has Java 25; Gradle wants 17 or 21).

```bash
brew install --cask android-commandlinetools temurin@21
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"

cd apps/mobile
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

The cloud build is easier and does not install anything here, so prefer it unless
you specifically want no account.

## Notes

`android/` is generated, gitignored, and deliberately not committed. The project
is managed: `app.json` is the source of truth, and a committed `android/`
directory would silently stop `app.json` changes from applying. `expo prebuild`
regenerates it whenever a native build needs it.

## What a release build needs that a demo build does not

`pnpm apk` builds the `preview` profile, which sets `EXPO_PUBLIC_DEMO_MODE=true`:
no sign-in, no sync, a local database seeded with a small syllabus. Good for
showing the app; not the app.

The real build is the `preview-live` profile, which turns demo mode off. That
puts the sign-in screen in front of the tracker, and three things have to be in
place for it to work.

### 1. Supabase — already configured

`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set in
`apps/mobile/.env`. Email sign-in and sign-up work against them.

**The database migrations have not been applied to that project.** `trackers`
and the `tracker_id` columns exist in `supabase/migrations/` and are verified
against a local Postgres, but nothing has run them remotely. Until they do,
sign-in works and sync will fail on those tables. Apply them with:

```bash
supabase link --project-ref <ref> && supabase db push
```

### 2. Google sign-in — needs credentials

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is **empty**, which is why the "Continue with
Google" button does not appear: a button that cannot work is worse than no
button, because a student cannot tell it from their own mistake (D26).

To switch it on, create OAuth clients in the Google Cloud console for the
project behind your Supabase instance:

- a **Web** client — its id goes in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and the
  same id goes into Supabase → Authentication → Providers → Google;
- an **Android** client — needs the package name (`com.preppilot.app`) and the
  SHA-1 fingerprint of the signing key EAS generates. Get that with
  `npx eas credentials` after the first build.

The button appears on its own once the web client id is present; no code change.

### 3. Guest mode — works with no configuration

"Continue without an account" needs nothing set up. A guest gets the tracker,
templates, notes, cards, sessions, reminders and Focus Mode, all stored on the
device. The assistant is the one thing held back, because a call has to be
attributed to an account.

Signing in later **adopts everything the guest made** — see
`src/db/claim-guest-data.ts`. Their rows are re-owned by the account and marked
for sync, so a fortnight of ticking off a syllabus is not lost by finally
creating an account.

## Reminders on a device versus in a browser

On Android the OS holds the schedule, so a reminder fires with PrepPilot closed.
In a browser there is no OS scheduler to hand it to, so `notifications.web.ts`
holds a timer in the tab: reminders fire while the tab is open and not
otherwise. The reminders screen says so rather than implying an alarm it cannot
deliver.

## Why the APK was 116 MB, and what it is now

An Expo Android APK contains the JavaScript bundle, the assets, and a **copy of
every native library for each CPU architecture**. The universal APK EAS builds
by default carries four: `arm64-v8a`, `armeabi-v7a`, `x86` and `x86_64`.

Measured on this project:

| Part                       | Size                             |
| -------------------------- | -------------------------------- |
| JavaScript bundle (Hermes) | 5.7 MB                           |
| Assets and generated icons | under 0.1 MB                     |
| Everything else            | about 103 MB of native libraries |

Two of those four architectures are emulator-only. The `preview` profile now
passes `-PreactNativeArchitectures=arm64-v8a`, which builds one — the
architecture every Android phone sold since roughly 2019 uses.

**To support older 32-bit phones**, add the second architecture back:

```json
"gradleCommand": ":app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
```

That lands around 60–70 MB instead of 35–45 MB.

The remaining size is React Native, Hermes, the New Architecture and the native
modules the app genuinely uses — SQLite, notifications, secure storage, SVG,
Reanimated, screens and gesture handling. None of it can be removed without
removing a feature.
