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

**Local env:** `.env.local` (gitignored) holds `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `EXPO_PUBLIC_APTABASE_KEY` turns on anonymous product analytics via `src/utils/analytics.js` (`track(Events.X, props)`; no-op without the key; events are counts only, never names/ids; the privacy policy lists Aptabase). The same values are inlined in `eas.json` for production builds. `EXPO_PUBLIC_SENTRY_DSN` turns on crash reporting via `src/utils/sentry.js` (Sentry org `isaac-23`, project `groov`; the DSN is public and lives in eas.json); without it Sentry is a no-op. Source-map upload uses the `@sentry/react-native/expo` plugin in app.json (org `isaac-23`, project `groov`) plus the `SENTRY_AUTH_TOKEN` EAS environment variable (set for production and preview); local builds skip the upload because the token is not present locally.

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
- **Builds:** `eas build --profile development|preview|production --platform android|ios --non-interactive --no-wait`, then poll `eas build:view <id> --json`. The EAS project is `@isaaceast/MyApp` (display name "Groov"); the `slug` in app.json must stay `MyApp` because EAS has no project rename and a mismatch with `extra.eas.projectId` is a hard error in eas-cli. Changing it means creating a new EAS project and re-uploading credentials. Needs `EXPO_TOKEN` (user env var). iOS signing credentials (distribution cert + ad hoc profile for Isaac's iPhone) are stored on Expo, so iOS builds need no Apple auth; new devices need `eas device:create` in an interactive window, and the first build after adding one needs an interactive run to regenerate the profile. The ASC API key env vars (`EXPO_ASC_*`, `EXPO_APPLE_TEAM_ID`, `EXPO_APPLE_TEAM_TYPE=INDIVIDUAL`) work only after `node scripts/patch-eas-token-skew.mjs` has been run against the installed eas-cli (apple-utils signs 20-minute tokens, Apple rejects them when the clock is a second ahead; see `docs/AUTH_SETUP.md` 3b). Re-run the patch after updating eas-cli. Install preview builds from the build page in Safari on the phone.
- **Testing on Android:** start Metro with `npx expo start --localhost` (never with `CI=1`: CI mode disables Metro's file watcher, so edits silently never reach the app), then `bash scripts/run-android.sh --boot` (boots AVD `groov_pixel`, builds the x86_64 debug APK, installs, launches). Use that script rather than `npx expo run:android`: a MinGW cmake on the user PATH breaks the native build unless the PATH is scrubbed and `android/local.properties` points `cmake.dir` at the SDK cmake. Drive the UI with `source scripts/emu.sh` (`tap X Y`, `type "text"`, `shot name`, `dismiss_banner`); its `type` paces letters so two "r" key events never land within 200 ms, because the dev build treats that as "reload JS" when focus is inside a Modal. Coordinates are in 1080x2400 device space; screenshots land in `.emu-shots/`. Dismiss the yellow LogBox banner before tapping the tab bar, it swallows touches. Chrome's first-run wizard on a fresh emulator is skipped with `adb shell 'echo "chrome --disable-fre --no-first-run" > /data/local/tmp/chrome-command-line'`. A test account `claude-test@example.com` exists on the Supabase project (email confirmation is off). Maestro flows are welcome in `.maestro/`.
- **Website:** `site/` is the public Groov site (landing, privacy policy, terms, support), deployed by Cloudflare Pages from this repo (root directory `site`, no build step) at https://isaaceast.com/groov. Keep `privacy-policy.html` and `terms.html` in step with what the app actually collects; the in-app links point at the clean URLs `/groov/privacy-policy` and `/groov/terms`.
- **Research:** `research_notes/` and `reports/` are gitignored local research output. The market comparison report there drives the roadmap tiers.

## Stack

- **Expo SDK 54** / React Native 0.81.5 / React 19.1.0, JavaScript (tsconfig exists but all files are `.js`)
- No file-based routing; no React Navigation library (custom pager in `App.js`)
- **Supabase** for auth and cloud sync (`@supabase/supabase-js`), AsyncStorage as the local-first store
- expo-audio (native) + Web Audio API in `src/utils/sounds.js`; chimes play on habit/challenge completion when `settings.soundEnabled`
- expo-notifications for local per-habit and global reminders. Categories give reminders Done / Snooze 1h buttons (handled in AppContext via `listenForNotificationResponses`); per-habit reminders back off after 3 consecutive missed days (`reminderDueWithBackoff`); the OS permission dialog is always preceded by `NotificationPrimer` via `ensureNotificationPermission()`; the app badge shows habits left today
- react-native-svg for the progress ring; charts and heatmap are hand-built (no chart library installed)
- expo-apple-authentication, expo-web-browser, expo-linking, expo-crypto for social sign-in

## Architecture

**Entry point:** `index.js` → `registerRootComponent(App)` → `App.js`

**Gating order:** `ErrorBoundary` → `AuthProvider` → `AuthGate` (no session renders `AuthScreen`) → `AppProvider` (keyed by user id) → `OnboardingScreen` until `hasOnboarded` → tab navigator.

**Navigation:** Custom slide navigator in `App.js`. All 5 screens are rendered simultaneously in a horizontal `Animated.View`; inactive screens have `pointerEvents="none"`. Navigation is driven by swipe gestures (`PanResponder`) and tab-bar taps. Tab order: Today → Progress → Challenge → Habits → Settings. Screens can request a tab via `requestedTab`; swiping is disabled while `modalOpen`.

**Auth:** `src/context/AuthContext.js`. Email/password (with OTP password reset), Sign in with Apple (iOS/iPadOS only, native sheet + `signInWithIdToken` with nonce), Google (Supabase OAuth in the system browser, PKCE, redirect `groov://auth/callback`), and guest accounts (`signInAnonymously`; Supabase anonymous sign-ins + manual linking are enabled). Guests link later from Settings via `LinkAccountSheet` (`linkEmail` = `updateUser`, `linkWithGoogle`/`linkWithApple` = `linkIdentity`), keeping the same user id. Exposes `authProvider` (`email|apple|google|anonymous`), `isAnonymous` and `appleAvailable`. A pg_cron job purges anonymous users idle for 90 days. Account deletion calls the `delete-account` edge function. Setup steps: `docs/AUTH_SETUP.md`.

**Global state:** `src/context/AppContext.js` — single React Context + `useState` hooks wrapping the entire app. All business logic (habits, completions, challenges, settings, streaks) lives here. Each state key is persisted to its own AsyncStorage key and mirrored to Supabase with fire-and-forget upserts in `src/services/sync.js` (last-write-wins, no conflict resolution). On login, cloud data replaces local if the cloud has habits; otherwise local is pushed.

**AI coaching:** `src/services/aiCoaching.js` calls Supabase Edge Functions `generate-nudge` (daily, cached in `ai_nudges`) and `generate-reflection` (weekly/monthly, cached in `ai_reflections`). The Anthropic key lives only in edge function secrets.

**Screens** (`src/screens/`):
- `AuthScreen` — login / register / forgot / reset modes plus Apple and Google buttons
- `TodayScreen` — greeting, progress ring, habit list, AI nudge card, challenge mini-cards, celebrations
- `ProgressScreen` — stat tiles, 7-day bar chart, 7/30/90-day heatmap with day detail, AI reflection card
- `ChallengeScreen` — active & archived challenges (max 3 concurrent), create/edit sheet
- `HabitsScreen` — create/edit/delete habits, per-habit reminders, emoji or photo icons
- `SettingsScreen` — theme, notifications, haptics, account, data, hidden dev tools (date offset, seed history)
- `OnboardingScreen` — first-run flow: 2 intro slides, starter-habit picker (`STARTER_HABITS`), per-habit time-of-day + implementation intention (`habit.intention`, "After I …"), then `completeOnboarding(habits)` creates them plus the 3-Day Kickstart (rendered outside the navigator)

**Components** (`src/components/`): `HabitCard`, `HabitDetailSheet` (per-habit grid/stats, opened from the Habits list), `ProgressRing` (SVG), `TimePicker` (wheel-only modal), `BottomSheet`, `SheetHeader`, `EmptyCard`, `Slider`, `TrophyCelebration`, `CelebrationOverlay`, `CompletionCelebration`, `ChallengeRewardModal`

**Utilities** (`src/utils/`): `storage.js` (AsyncStorage wrappers), `backup.js` (JSON backup build/validate/merge; `src/services/backup.js` does the share sheet / document picker, Settings → Backup), `supabase.js` (client, PKCE), `sounds.js`, `haptics.js`, `notifications.js`

**Theme:** `src/theme/colors.js` exports light and dark token objects; the in-app theme is a manual toggle in settings (does not follow the system yet).

## Data Models

- **Habit:** `{ id, name, icon (emoji|null), customIconUri, type ('daily'|'volume'), volumeGoal, unit, schedule, color (hex|null), timeOfDay ('anytime'|'morning'|'afternoon'|'evening'), archived, sortOrder, reminder: { enabled, hour12, minute, ampm }, createdAt }`. `AppContext.habits` is the active ordered list; `allHabits`/`archivedHabits` include archived ones. Custom icons: `customIconUri` is a durable file under the document dir `habit-icons/<id>.jpg` and `iconStoragePath` the private Supabase Storage object `<uid>/<id>.jpg` (`src/services/icons.js`; AppContext re-downloads missing files and `HabitIcon` falls back to the emoji on error). `schedule` is `{ type: 'daily' }` | `{ type: 'weekdays', days: [0-6] }` | `{ type: 'perWeek', target: 1-6 }` (missing = daily). All schedule/streak rules live in `src/utils/schedule.js` and `src/utils/streaks.js` (pure, Jest-tested; the edge functions mirror them in `supabase/functions/_shared/schedule.ts`).
- **Completions:** keyed by `YYYY-MM-DD`, each date maps `habitId → count`. `notes` has the same shape with text values and rides on the `completions.note` column. `dailySnapshot` records which habits existed each day so history stays accurate.
- **Challenge:** `{ id, name, description, days, icon, completedDays[], completed, startDate, linkedHabitIds[] }`. Tier (platinum/gold/silver/copper) is computed at archive time from completedDays/days via `getChallengeTier`.
- **Settings:** `{ theme, soundEnabled, hapticsEnabled, notificationsEnabled, reminders[], eveningReminder* }`. `dateOffset` is stored separately (dev tool).

## Key Behaviors

- "Today" uses `dateOffset` (from Settings dev tools) to simulate different dates during development.
- Volume habits track a numeric count; daily habits toggle 0/1. Today is logged from the card; past days via long-press (yesterday) or `setHabitCountOn`/`toggleHabitDoneOn`; never the future.
- Streak forgiveness: `settings.skips` ({date: [habitId]}, long-press "Skip today") and `settings.streakFreezes` (date list, 2 auto per month, reconciled in AppContext from the real date) are rest days for streak purposes (`isExcused`). Both sync via the settings row.
- Streaks are computed on the fly; the overall streak counts a day only if every *scheduled* habit in that day's snapshot met its goal. Unscheduled days are rest days (chain preserved, no increment) and an unfinished today never breaks a streak.
- Challenge days are auto-claimed from `TodayScreen` when all linked habits are done; expired challenges archive with a tiered reward modal.
- Celebrations: a perfect day gets a light confetti burst only. The full-screen `CompletionCelebration` is reserved for streak milestones (`STREAK_MILESTONES` 7/30/100/365, recorded in `settings.milestones`, queued via `pendingMilestone`) and `TrophyCelebration` for challenge completion. The Progress trophy case lists earned milestones and challenge medals.
- Date keys must be local dates; several places still use `toISOString()` (UTC) and are tracked as a bug.
