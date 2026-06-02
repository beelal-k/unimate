# UniMate

A student companion app that actually does what it says. Tracks your Moodle assignments, keeps your class schedule, manages offline files, and has an AI chat for when you're stuck. Built with React Native because apparently we're doing that now.

---

## Stack

- **React Native + Expo SDK 55** — managed workflow, EAS builds
- **Expo Router** — file-based navigation
- **Zustand** — state management
- **SQLite + Drizzle ORM** — local-first persistence
- **Turso (libSQL)** — remote sync for schedule and assignments
- **NativeWind** — Tailwind CSS in React Native, works better than expected
- **PostHog** — feature flags, used for OTA update notifications
- **Reanimated + Gesture Handler** — animations

---

## Local Setup

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- For Android: Android Studio with an emulator, or a physical device
- For iOS: Xcode (Mac only)

### Install

```bash
git clone https://github.com/beelal-k/unimate.git
cd unimate/app
npm install
```

### Environment Variables

Create a `.env` file in the `app/` directory. All `EXPO_PUBLIC_` vars are inlined by Metro at bundle time so they're available on the client.

```env
# Turso — remote database sync. Get these from your Turso project dashboard.
EXPO_PUBLIC_TURSO_URL=libsql://your-db.turso.io
EXPO_PUBLIC_TURSO_AUTH_TOKEN=your-turso-auth-token

# PostHog — update notifications via feature flags. Optional in dev.
EXPO_PUBLIC_POSTHOG_KEY=phc_your_key_here

# APK fallback URL if the direct download fails (e.g. your GitHub releases page)
EXPO_PUBLIC_APK_FALLBACK_URL=https://github.com/beelal-k/unimate/releases

# Gemini API key — only needed if you're working on the AI chat feature
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
```

The app works without most of these in dev — Turso sync will be disabled, PostHog will be a no-op, and the AI chat is commented out. You really only need the Turso ones if you're touching sync.

### Run

```bash
npx expo start
```

Press `a` for Android emulator, `i` for iOS simulator. Scan the QR code with [Expo Go](https://expo.dev/client) if you're on a physical device.

---

## Building

Builds are handled by EAS. The CI pipeline runs automatically on every push to `master` that touches `app/` — it bumps the patch version, builds an Android APK, uploads it to GitHub Releases, and updates the PostHog feature flag so existing users get notified.

To build manually:

```bash
eas build -p android --profile preview --non-interactive
```

You'll need an `EXPO_TOKEN` for this. The `eas.json` has a `preview` profile configured for APK output.

---

## Project Structure

```
app/
  app/           # Expo Router screens ((tabs), (auth), (modals))
  components/    # UI components, grouped by feature
  lib/
    api/         # Moodle API client
    db/          # Drizzle schema, migrations, Turso sync
    services/    # APK update service, notifications, background sync
    store/       # Zustand stores (schedule, LMS, files, friends, etc.)
    session.ts   # SecureStore helpers for user identity
```

---

## Contributing

Fork, branch off `master`, PR back. Keep commits scoped — the version bump in CI is fully automated so don't bump `package.json` manually or the pipeline will loop.
