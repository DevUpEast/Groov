# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Start dev server (Expo Go / QR code):**
```powershell
npm start
```

**Run on specific platform:**
```powershell
npm run android   # Android emulator (AVD "groov_pixel") or device
npm run ios       # iOS simulator (macOS only; this machine is Windows, use EAS builds)
npm run web       # Browser
```

> On Windows, if `npm` is not found in a new terminal, refresh PATH first:
> `$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")`

> Always refer to versioned Expo docs at https://docs.expo.dev/versions/v54.0.0/ before writing Expo-specific code.

**Local env:** `.env.local` (gitignored) holds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. The same values are inlined in `eas.json` for production builds.

**Quick compile check (no device):** `npx expo export --platform web --output-dir $env:TEMP\groov-web-export`

## Tooling on this machine (Windows 11)

Installed for the current user, no admin needed:
- Node 24 LTS (winget, user scope), `eas-cli` global
- Scoop: `supabase` CLI, `temurin17-jdk` (`JAVA_HOME` set)
- Android SDK at `%LOCALAPPDATA%\Android\Sdk` (command-line tools only, no Android Studio): platform-tools, emulator, API 36, AVD `groov_pixel`. `ANDROID_HOME` set; `platform-tools` and `emulator` on PATH.
- `gh` CLI authenticated as DevUpEast (repo admin, `project` scope)

Not possible here: Xcode / iOS Simulator. iOS testing = EAS development build or TestFlight on a physical device.

## Autonomous workflow

- **Tickets:** GitHub Project "Groov Roadmap" (`gh project list --owner DevUpEast`, number 2) linked to `DevUpEast/Groov`. Status columns: Backlog, Todo, Blocked: needs Isaac, In Progress, In Review, Done. Labels: `tier-0: fix`, `tier-1: table stakes`, `tier-2: differentiator`, `tier-3: later`, `auth`, `backend`, `infra`, `ux`, `needs-isaac`. Move a card to In Progress when starting, In Review when a PR is open, Done after merge. Anything that needs a credential or human decision gets `needs-isaac` and the Blocked column.
- **Git:** branch per ticket (`feat/<slug>`, `fix/<slug>`), conventional commit messages, open a PR with `gh pr create` referencing the issue (`Closes #N`). Do not commit directly to `master`. **Merge policy (Isaac, 2026-10-13):** Claude merges its own PRs with `gh pr merge --merge` once the change is verified on the Android emulator (or on web for web-only changes); no human review is required. Keep the repo public.
- **Backend:** Supabase project ref `fdplqvebauivtlywornw` (name "Habit Tracker Demo"). Schema changes go in `supabase/migrations/*.sql` and are applied with `supabase db push`; edge functions in `supabase/functions/*` deploy with `supabase functions deploy <name>`. Requires `SUPABASE_ACCESS_TOKEN` and a one-time `supabase link`. Auth provider config is scripted in `scripts/supabase-auth-providers.mjs` (Management API).
- **Builds:** `eas build --profile development|preview|production --platform android|ios --non-interactive --no-wait`, then poll `eas build:view <id> --json`. Needs `EXPO_TOKEN` (user env var). iOS signing credentials (distribution cert + ad hoc profile for Isaac's iPhone) are stored on Expo, so iOS builds need no Apple auth; new devices need `eas device:create` in an interactive window, and the first build after adding one needs an interactive run to regenerate the profile. The ASC API key env vars currently fail with Apple 401 and are only relevant to `eas submit` (see `docs/AUTH_SETUP.md` 3b). Install preview builds from the build page in Safari on the phone.
- **Testing on Android:** start Metro with `npx expo start --localhost` (never with `CI=1`: CI mode disables Metro's file watcher, so edits silently never reach the app), then `bash scripts/run-android.sh --boot` (boots AVD `groov_pixel`, builds the x86_64 debug APK, installs, launches). Use that script rather than `npx expo run:android`: a MinGW cmake on the user PATH breaks the native build unless the PATH is scrubbed and `android/local.properties` points `cmake.dir` at the SDK cmake. Drive the UI with `source scripts/emu.sh` (`tap X Y`, `type "text"`, `shot name`, `dismiss_banner`); its `type` paces letters so two "r" key events never land within 200 ms, because the dev build treats that as "reload JS" when focus is inside a Modal. Coordinates are in 1080x2400 device space; screenshots land in `.emu-shots/`. Dismiss the yellow LogBox banner before tapping the tab bar, it swallows touches. Chrome's first-run wizard on a fresh emulator is skipped with `adb shell 'echo "chrome --disable-fre --no-first-run" > /data/local/tmp/chrome-command-line'`. A test account `claude-test@example.com` exists on the Supabase project (email confirmation is off). Maestro flows are welcome in `.maestro/`.
- **Research:** `research_notes/` and `reports/` are gitignored local research output. The market comparison report there drives the roadmap tiers.

## Stack

- **Expo SDK 54** / React Native 0.81.5 / React 19.1.0, JavaScript (tsconfig exists but all files are `.js`)
- No file-based routing; no React Navigation library (custom pager in `App.js`)
- **Supabase** for auth and cloud sync (`@supabase/supabase-js`), AsyncStorage as the local-first store
- expo-av (deprecated, migration to expo-audio pending) + Web Audio API in `src/utils/sounds.js` (currently not wired in)
- expo-notifications for local per-habit and global reminders
- react-native-svg for the progress ring; charts and heatmap are hand-built (no chart library installed)
- expo-apple-authentication, expo-web-browser, expo-linking, expo-crypto for social sign-in

## Architecture

**Entry point:** `index.js` → `registerRootComponent(App)` → `App.js`

**Gating order:** `ErrorBoundary` → `AuthProvider` → `AuthGate` (no session renders `AuthScreen`) → `AppProvider` (keyed by user id) → `OnboardingScreen` until `hasOnboarded` → tab navigator.

**Navigation:** Custom slide navigator in `App.js`. All 5 screens are rendered simultaneously in a horizontal `Animated.View`; inactive screens have `pointerEvents="none"`. Navigation is driven by swipe gestures (`PanResponder`) and tab-bar taps. Tab order: Today → Progress → Challenge → Habits → Settings. Screens can request a tab via `requestedTab`; swiping is disabled while `modalOpen`.

**Auth:** `src/context/AuthContext.js`. Email/password (with OTP password reset), Sign in with Apple (iOS/iPadOS only, native sheet + `signInWithIdToken` with nonce), Google (Supabase OAuth in the system browser, PKCE, redirect `groov://auth/callback`). Exposes `authProvider` (`email|apple|google`) and `appleAvailable`. Account deletion calls the `delete-account` edge function. Setup steps: `docs/AUTH_SETUP.md`.

**Global state:** `src/context/AppContext.js` — single React Context + `useState` hooks wrapping the entire app. All business logic (habits, completions, challenges, settings, streaks) lives here. Each state key is persisted to its own AsyncStorage key and mirrored to Supabase with fire-and-forget upserts in `src/services/sync.js` (last-write-wins, no conflict resolution). On login, cloud data replaces local if the cloud has habits; otherwise local is pushed.

**AI coaching:** `src/services/aiCoaching.js` calls Supabase Edge Functions `generate-nudge` (daily, cached in `ai_nudges`) and `generate-reflection` (weekly/monthly, cached in `ai_reflections`). The Anthropic key lives only in edge function secrets.

**Screens** (`src/screens/`):
- `AuthScreen` — login / register / forgot / reset modes plus Apple and Google buttons
- `TodayScreen` — greeting, progress ring, habit list, AI nudge card, challenge mini-cards, celebrations
- `ProgressScreen` — stat tiles, 7-day bar chart, 7/30/90-day heatmap with day detail, AI reflection card
- `ChallengeScreen` — active & archived challenges (max 3 concurrent), create/edit sheet
- `HabitsScreen` — create/edit/delete habits, per-habit reminders, emoji or photo icons
- `SettingsScreen` — theme, notifications, haptics, account, data, hidden dev tools (date offset, seed history)
- `OnboardingScreen` — 3-slide first-run walkthrough (rendered outside the navigator)

**Components** (`src/components/`): `HabitCard`, `ProgressRing` (SVG), `TimePicker` (wheel-only modal), `BottomSheet`, `SheetHeader`, `EmptyCard`, `Slider`, `TrophyCelebration`, `CelebrationOverlay`, `CompletionCelebration`, `ChallengeRewardModal`

**Utilities** (`src/utils/`): `storage.js` (AsyncStorage wrappers), `supabase.js` (client, PKCE), `sounds.js`, `haptics.js`, `notifications.js`

**Theme:** `src/theme/colors.js` exports light and dark token objects; the in-app theme is a manual toggle in settings (does not follow the system yet).

## Data Models

- **Habit:** `{ id, name, icon (emoji|null), customIconUri, type ('daily'|'volume'), volumeGoal, reminder: { enabled, hour12, minute, ampm }, createdAt }`. Every habit is due every day (no schedules yet).
- **Completions:** keyed by `YYYY-MM-DD`, each date maps `habitId → count`. `dailySnapshot` records which habits existed each day so history stays accurate.
- **Challenge:** `{ id, name, description, days, icon, completedDays[], completed, startDate, linkedHabitIds[] }`. Tier (platinum/gold/silver/copper) is computed at archive time from completedDays/days via `getChallengeTier`.
- **Settings:** `{ theme, soundEnabled, hapticsEnabled, notificationsEnabled, reminders[], eveningReminder* }`. `dateOffset` is stored separately (dev tool).

## Key Behaviors

- "Today" uses `dateOffset` (from Settings dev tools) to simulate different dates during development.
- Volume habits track a numeric count; daily habits toggle 0/1. Only today can be logged.
- Streaks are computed on the fly; the overall streak counts a day only if every habit in that day's snapshot met its goal.
- Challenge days are auto-claimed from `TodayScreen` when all linked habits are done; expired challenges archive with a tiered reward modal.
- Date keys must be local dates; several places still use `toISOString()` (UTC) and are tracked as a bug.
