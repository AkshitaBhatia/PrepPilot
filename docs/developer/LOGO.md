# Replacing the logo

There is one logo: **`apps/mobile/assets/logo.svg`**.

Replace that file, run one command, rebuild. The in-app branding, the Android
launcher icon and the splash image all change together.

```bash
cd apps/mobile
# 1. put your logo at assets/logo.svg
pnpm logo:build   # regenerates the PNGs Android needs
```

## Why SVG is the source

The app renders the SVG directly — `metro.config.js` compiles `.svg` into a
React component, so the mark is drawn as vectors and stays sharp at any size.
Android cannot use an SVG for a launcher icon or a splash image, so those are
PNGs; `pnpm logo:build` generates them from the same file. Keeping hand-made
PNGs alongside the SVG is how a rebrand ends up half-done, with the new mark in
the app and the old one on the home screen.

## What reads it

| Where                       | How                                                    |
| --------------------------- | ------------------------------------------------------ |
| Splash screen               | `<Logo />` → `assets/logo.svg`                         |
| Sign-in, sign-up, phone OTP | `<Logo />` via `AuthLayout`                            |
| Browser-build notice        | `<Logo />`                                             |
| Android launcher icon       | `assets/images/icon.png`, generated                    |
| Android adaptive icon       | `assets/images/android-icon-foreground.png`, generated |
| Native splash image         | `assets/images/splash-icon.png`, generated             |
| Web favicon                 | `assets/images/favicon.png`, generated                 |

`src/components/ui/logo.tsx` is the only file that imports the asset. Nothing
else should: separate copies are the problem this solves.

## Rules for a replacement

- **Keep the viewBox square** unless you want letterboxing. The component sizes
  by width and height and the SVG's own `preserveAspectRatio` does the rest, so
  a wide wordmark is centred rather than stretched — never distorted, but it
  will not fill a square slot.
- **Use plain colours, not CSS variables.** `react-native-svg` does not
  understand `var(--x)`, so anything themed that way renders as nothing in the
  app. The generator resolves `var(name, fallback)` to the fallback for the
  PNGs, but the app would still show a gap.
- **PNG or JPG instead?** Put it at `assets/logo.svg` anyway is not possible —
  for a raster logo, replace the generated `assets/images/icon.png` and change
  `src/components/ui/logo.tsx` to `<Image source={require(...)} />`. The SVG
  route is better if you have one.

## The Android icon is separate from the in-app mark

They are configured separately in `app.json` — `android.adaptiveIcon` for the
launcher, `expo-splash-screen` for the splash — but both point at files the
generator writes from `logo.svg`, so there is still one thing to replace.

The adaptive-icon foreground is generated with 30% padding because Android masks
it to a circle and crops hard; without the margin the ring loses its edges.
