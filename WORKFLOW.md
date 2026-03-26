# Development & CI workflow

How code moves from a branch to shipped **web**, **Android**, and **iOS** builds.

## Overview

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────────┐
│  PR or push     │ ──► │  CI              │     │  main only (after merge)    │
│  to main        │     │  lint + build    │     │  Build Android + Build iOS  │
└─────────────────┘     └──────────────────┘     └─────────────────────────────┘
```

| Workflow | File | When it runs | What it does |
|----------|------|----------------|--------------|
| **CI** | `.github/workflows/ci.yml` | Every **PR** targeting `main`, every **push** to `main`, or **manual** | `npm run lint`, `npm run build` (static export) |
| **Build Android** | `.github/workflows/build-android.yml` | **Push** to `main` or **manual** | `npm run build`, `cap sync android`, signed `assembleRelease` when secrets exist (else debug), upload APK artifact + release asset |
| **Build iOS** | `.github/workflows/build-ios.yml` | **Push** to `main` or **manual** | `npm run build`, `cap sync ios`, Xcode build, upload **App.app** (+ optional release upload) |

## Typical developer flow

1. **Branch** off `main`, make changes.
2. **Locally:** `npm install --legacy-peer-deps`, `npm run dev` (or `npm run build` before mobile).
3. **Open a PR** → **CI** must pass (lint + static build).
4. **Merge to `main`** → **Build Android** and **Build iOS** run (heavy jobs).
5. **Get artifacts:** GitHub → **Actions** → select the run → **Artifacts** (APK / iOS app).

## Manual runs

In GitHub: **Actions** → choose **CI**, **Build Android**, or **Build iOS** → **Run workflow**.

## Environment / secrets

- **CI** does not need Electrs or price API keys for a green build; Next reads env at build time where required.
- For **production-like** mobile builds, set repo **Variables** / **Secrets** if you inject `NEXT_PUBLIC_*` at build time (see `.env.example`).
- **Android signing secrets** are required for true in-place user updates (same keystore each release):
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Local Android / iOS

See **[ANDROID.md](./ANDROID.md)** and **[IOS.md](./IOS.md)** for Studio/Xcode steps and signing.
