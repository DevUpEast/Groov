# Groov — Full App Context & Architecture

## Overview

A habit-tracking mobile app built with Expo / React Native. Users create daily or volume-based habits, track completion streaks, run personal challenges linked to specific habits, and review historical progress. The app supports light/dark themes, push notifications with individual reminders, audio chimes, and haptic feedback.

---

## Tech Stack

| Layer | Library / Version |
|---|---|
| Runtime | Expo SDK ~54.0.0 |
| Framework | React Native 0.81.5 / React 19.1.0 |
| Navigation | **Custom slide navigator** (no React Navigation) |
| State | React Context + useState (no Redux / Zustand) |
| Persistence | @react-native-async-storage/async-storage 2.2.0 |
| Audio | expo-audio ~1.1 (static import) + Web Audio API (web) |
| Haptics | expo-haptics ~15.0.8 + Vibration fallback |
| Notifications | expo-notifications ~0.32.17 |
| Image picker | expo-image-picker ~17.0.11 |
| File system | expo-file-system ~19.0.23 (static import) |
| Graphics | react-native-svg 15.12.1 |
| Safe area | react-native-safe-area-context ~5.6.0 |
| Icons | @expo/vector-icons (Ionicons) |
| Web support | react-native-web ^0.21.0 |

Entry point: `index.js` → `registerRootComponent(App)` → `App.js`

---

## File Structure

```
Groov/
├── App.js                          # Root: SafeAreaProvider + AppProvider + AppNavigator
├── index.js                        # Expo entry point
├── app.json                        # Expo app config
├── package.json
├── PLAN.md                         # This file
├── CLAUDE.md                       # Claude Code instructions
├── start-expo.bat                  # Launches expo start in new cmd window
├── assets/
└── src/
    ├── components/
    │   ├── CelebrationOverlay.js   # Floating confetti (habit/challenge cheer)
    │   ├── CompletionCelebration.js# Full-screen ring-expand + confetti (all habits done)
    │   ├── HabitCard.js            # Individual habit row in Today screen
    │   ├── ProgressRing.js         # SVG circular progress indicator
    │   ├── TimePicker.js           # Wheel-only hour/min/AM-PM modal picker
    │   └── TrophyCelebration.js    # Challenge-complete trophy animation overlay
    ├── context/
    │   └── AppContext.js           # Global state + all business logic
    ├── screens/
    │   ├── TodayScreen.js          # Main daily habit tracking
    │   ├── ProgressScreen.js       # Stats, bar chart, heatmap (7/30/90d)
    │   ├── ChallengeScreen.js      # Active + Past challenges
    │   ├── HabitsScreen.js         # CRUD habits + per-habit reminders
    │   ├── SettingsScreen.js       # Theme, notifications, sound, haptics, dev tools
    │   └── OnboardingScreen.js     # 3-slide first-run walkthrough
    ├── theme/
    │   └── colors.js               # Light and dark theme color tokens
    └── utils/
        ├── haptics.js              # Light / medium / heavy impact + success notification
        ├── notifications.js        # Expo Notifications scheduling + permission
        ├── sounds.js               # Cross-platform audio (Web Audio API / expo-audio WAV)
        └── storage.js              # AsyncStorage save/load/clear wrappers
```

---

## Navigation (`App.js`)

**Custom slide navigator** — No React Navigation. Handled entirely with `Animated` + `PanResponder`.

### How it works

- All 5 screens render side-by-side in a `flexDirection: 'row'` `Animated.View` that is `SCREEN_WIDTH * 5` wide.
- Active screen shown by translating to `-activeIndex * SCREEN_WIDTH`.
- **Tab tap:** `goToTab(i)` fires `Animated.timing` over 180ms (`Easing.out(Easing.quad)`).
- **Swipe:** `PanResponder` requires `|dx| > 12` and `|dx| > |dy| * 1.8`. Release threshold: `SCREEN_WIDTH * 0.25`.
- Off-screen slots use `pointerEvents="none"`.
- `isAnimating` ref blocks double-fires during transition.
- **Swipe lock:** `modalOpenRef` (synced from `context.modalOpen`) blocks swipe when any bottom sheet is visible.
- **Tab navigation from context:** `requestedTab` watched by `useEffect`; when set, calls `goToTab(requestedTab)` then clears it.

### Tab order

| Index | Tab | Screen | Icon (Ionicons) |
|---|---|---|---|
| 0 | Today | TodayScreen | home-outline |
| 1 | Progress | ProgressScreen | bar-chart-outline |
| 2 | Challenge | ChallengeScreen | trophy-outline |
| 3 | Habits | HabitsScreen | clipboard-outline |
| 4 | Settings | SettingsScreen | settings-outline |

Tab bar height: `49 + safeAreaInsets.bottom` on iOS, `56` on Android.

### CRITICAL — Rules of Hooks in AppNavigator

ALL hooks must be declared **before** the conditional `if (!hasOnboarded) return <OnboardingScreen />`. The hook list in order:
1. `useApp()` destructuring
2. `useSafeAreaInsets()`
3. `useState(0)` — activeIndex
4. `useRef(new Animated.Value(0))` — translateX
5. `useRef(false)` — isAnimating
6. `useRef(0)` — activeIndexRef
7. `useRef(false)` — modalOpenRef
8. `useEffect` — sync modalOpenRef from modalOpen
9. `useCallback` — goToTab
10. `useEffect` — watch requestedTab
11. `useRef(PanResponder.create(...))` — panResponder

---

## Data Models

### Habit
```js
{
  id: string,            // Date.now().toString()
  name: string,
  icon: string | null,   // emoji, null if customIconUri set
  customIconUri: string | null,
  type: 'daily' | 'volume',
  volumeGoal: number,    // 1 for daily, 2–N for volume
  createdAt: string,     // 'YYYY-MM-DD'
  reminder: {
    enabled: boolean,
    hour12: number,      // 1–12
    minute: number,      // 0–59
    ampm: 'AM' | 'PM',
  } | undefined,
}
```

### Completions
```js
completions: {
  'YYYY-MM-DD': { [habitId]: number }
}
```

### Daily Snapshot
Written whenever `habits` changes. Stores which habits existed each day so historical totals stay correct after add/delete.
```js
dailySnapshot: {
  'YYYY-MM-DD': [{ id, name, icon, volumeGoal }, ...]
}
```

### Challenge (active)
```js
{
  id: string,
  name: string,
  description: string,
  icon: string,            // emoji, default '🏆'
  days: number,            // total duration
  completedDays: string[], // 'YYYY-MM-DD' strings — date-based, not index-based
  completed: boolean,
  startDate: string,       // 'YYYY-MM-DD'
  linkedHabitIds: string[], // habit IDs that count toward this challenge
}
```
- Up to **3 challenges** run simultaneously.
- `completedDays` stores actual date strings — not sequential indices.
- Day progression is calendar-based: `currentDay = min(days, daysSince(startDate) + 1)`.
- When `daysSince(startDate) >= days`, the challenge is expired and auto-archived.
- **Starter challenge** (`id: 'starter'`) has `linkedHabitIds: ['1','2','3','4']` (all 4 default habits).

### Past Challenge
```js
{
  ...challenge,
  archivedAt: string,   // 'YYYY-MM-DD'
  tier: 'platinum' | 'gold' | 'silver' | 'copper' | 'none',
}
```
Stored in `pastChallenges[]`. Archived when challenge expires, `deleteChallenge()` is called, OR `completeChallengeImmediately()` is called.

### Completion Tiers
| Tier | Completion % | Colors | Badge | Trophy |
|---|---|---|---|---|
| platinum | 100% | `#CCFFFE`/`#22D3EE` | 💎 | 🏆 |
| gold | 75–99% | `#FEF3C7`/`#F59E0B` | 🥇 | 🏆 |
| silver | 50–74% | `#F1F5F9`/`#94A3B8` | 🥈 | 🥈 |
| copper | 25–49% | `#FDE8D8`/`#CD7F32` | 🥉 | 🥉 |
| none | 0–24% | theme defaults | 📋 | 📋 |

`getChallengeTier(completedCount, totalDays)` is exported from AppContext. `TIER_STYLES` is also exported named.

### Settings
```js
{
  notificationsEnabled: boolean,
  reminders: [{
    id: string,          // 'reminder-{uuid}' for general, 'habit-{habitId}' for habit reminders
    label: string,
    time: { hour12, minute, ampm },
    enabled: boolean,
    habitId?: string,    // present if this reminder mirrors a habit's reminder
  }, ...],
  soundEnabled: boolean,
  hapticsEnabled: boolean,
  theme: 'light' | 'dark',
}
```
**Migration:** `migrateSettings()` converts old `morningTime`/`eveningTime` fields to `reminders[]` on load.

---

## AppContext (`src/context/AppContext.js`)

Single React Context consumed everywhere via `useApp()`.

### State
| Name | Type | Persisted key |
|---|---|---|
| `habits` | Habit[] | `habits` |
| `completions` | completion record | `completions` |
| `settings` | Settings | `settings` |
| `challenges` | Challenge[] | `challenges` |
| `pastChallenges` | PastChallenge[] | `pastChallenges` |
| `hasOnboarded` | boolean | `hasOnboarded` |
| `dailySnapshot` | `{date: HabitSummary[]}` | `dailySnapshot` |
| `dateOffset` | number | — (resets to 0 on start) |
| `modalOpen` | boolean | — runtime only |
| `requestedTab` | number \| null | — runtime only |
| `pendingHabitLinkChallenge` | string \| null | — runtime only |

Legacy key `challenge` (single object) is migrated to `challenges` array on first load.

`migrateChallenges()` ensures:
1. All challenges have `linkedHabitIds: []`.
2. If `id === 'starter'` and `linkedHabitIds.length === 0`, back-fills `['1','2','3','4']`.

### `todayStr()`
Returns `'YYYY-MM-DD'` offset by `dateOffset`. All date-sensitive operations use this.

### Computed / derived functions
- `getTodayCompletions()` → `{ [habitId]: count }` for today
- `getHabitCount(habitId)` → count today
- `isHabitDone(habit)` → `count >= volumeGoal`
- `getCompletedCount()` → total habits done today
- `isAllDone()` → every habit done today
- `isChallengeHabitsDone(challenge)` → all habits in `linkedHabitIds` are done (falls back to all habits if empty)
- `getStreakForHabit(habitId)` → consecutive days completed
- `getOverallStreak()` → consecutive days ALL habits done (snapshot-aware)
- `getLastNDays(n)` → `[{ date, completed, total, habits[] }]` (snapshot-aware)
- `getLast30Days()` → alias for `getLastNDays(30)`

### Habit actions
- `addHabit(habit)` → **returns new habit ID** (used by HabitsScreen to link to challenge)
- `updateHabit(id, updates)` — partial merge
- `deleteHabit(id)` — removes from `challenge.linkedHabitIds` AND removes any `habit-{id}` entry from `settings.reminders`
- `incrementHabit(habitId)` → returns `true` if just reached `volumeGoal`
- `decrementHabit(habitId)`
- `selectAllHabitsToday()` — sets every habit's count to its `volumeGoal` for today
- `resetAllHabitsToday()` — sets every habit's count to `0` for today

### Challenge actions
- `createChallenge(name, description, days, icon='🏆')` — max 3
- `editChallenge(challengeId, updates)` — partial merge
- `deleteChallenge(challengeId)` — computes tier, archives to `pastChallenges`
- `archiveExpiredChallenge(challengeId)` — idempotent (checks if already in `pastChallenges`); called by ChallengeScreen when `daysSince >= days`
- `completeChallengeImmediately(challengeId)` — marks today as a completed day AND archives in one atomic `setChallenges` call; used by TodayScreen when final day's habits are all done before the calendar day expires
- `markChallengeDay(challengeId)` — adds `todayStr()` to `completedDays`
- `unmarkChallengeDay(challengeId)` — removes today's date
- `linkHabitToChallenge(challengeId, habitId)`
- `unlinkHabitFromChallenge(challengeId, habitId)`
- `linkAllHabitsToChallenge(challengeId)` — sets `linkedHabitIds` to all current habit IDs

### Navigation / cross-screen coordination
- `setModalOpen(bool)` — called by screens when any bottom sheet opens/closes
- `setRequestedTab(index)` — triggers tab navigation from any screen
- `setPendingHabitLinkChallenge(challengeId | null)` — ChallengeScreen sets this when user taps "+ Add New Habit & Link"; HabitsScreen reads it on mount

### Settings / lifecycle
- `updateSettings(updates)` — partial merge
- `completeOnboarding()` — sets `hasOnboarded = true`
- `resetAll()` — clears AsyncStorage AND resets all in-memory state to defaults instantly

---

## Screens

### TodayScreen

**Layout:**
- `SafeAreaView` bg = `theme.primary` → purple status bar area. `ScrollView` has `backgroundColor: theme.bg`.
- Purple header: greeting (real clock) + offset-aware date + `ProgressRing` (completed/total).
- "TODAY'S HABITS" label row with **Mark All / Unmark All** button.
- Habit cards below.

**Mark All / Unmark All button:**
- Button is always visible next to the "TODAY'S HABITS" label.
- **Mark All** (when not all done): calls `selectAllHabitsToday()`, auto-claims all eligible challenges (including immediate archive for final-day completions), plays `playSuccessChime()` + `hapticFillSequence` + `CompletionCelebration`. If any challenges were fully completed, also shows `TrophyCelebration` after 500ms.
- **Unmark All** (when all done): calls `resetAllHabitsToday()`, unmarks all challenge days for today, resets `allDoneCelebrated.current = false`.

**allDoneCelebrated ref:**
- Ref prevents the completion animation from firing more than once per day.
- Reset by: any `decrementHabit` call, or when `todayStr()` changes (via `useEffect([today])`). The `useEffect` reset is critical — without it, the first Mark All on a new simulated day does not trigger the animation.

**Auto-claim challenges (per-habit increment):**
- Called when `incrementHabit()` returns `true` (justCompleted).
- "Will all be done" computed **synchronously** using pre-increment `completions` state:
  ```js
  const todayComps = completions[todayStr()] || {};
  const willAllBeDone = habits.every(h => {
    if (h.id === habit.id) return true;  // just completed
    return (todayComps[h.id] || 0) >= h.volumeGoal;
  });
  ```
  This avoids the stale-closure bug that happens with `setTimeout` + `isAllDone()`.
- For each un-claimed challenge: if all linked habits will be done, checks if it's the final calendar day (`newDaysList.length >= ch.days`). If so → `completeChallengeImmediately(ch.id)` + schedule `setTrophyCelebrating(true)`. Otherwise → `markChallengeDay(ch.id)`.

**Auto-unmark challenges on decrement:**
- Computes `willBeDone = (countBefore - 1) >= habit.volumeGoal`.
- If `!willBeDone`, iterates challenges with today in `completedDays` and that include this habit → calls `unmarkChallengeDay`.

**TrophyCelebration:**
- Shown both from individual habit completion (if challenge fully done) and from Mark All.
- Imported from `src/components/TrophyCelebration.js` (shared with ChallengeScreen).

### ProgressScreen

**Layout sections:**
- Heading "Your Progress"
- Stats row: 🔥 Day Streak / ⭐ Perfect Days (last 30d) / 📋 Habit count
- Weekly bar chart (7 bars, tappable → shows percentage tooltip)
- History heatmap with period toggle **7d / 30d / 90d** (1yr removed — caused lag)

**Heatmap:**
- `HEAT_INNER = SCREEN_WIDTH - 90` (48 scroll padding + 40 card padding + 2 border)
- **7d period:** renders as a single `flexDirection: 'row'` with `flex: 1` + `aspectRatio: 1` per cell — guarantees all 7 fit on one row regardless of screen size.
- **30d / 90d periods:** use `HeatmapCell` with fixed-size cells + negative right-margin technique.
- Cell colors: `theme.progressBarBg` (none), `#FDE68A` (partial), `theme.primary` (perfect).
- Tapping a period toggle: `lightImpact()` haptic.
- Tapping a bar: `lightImpact()` + shows `BarTooltip`.
- Tapping a heatmap cell: `lightImpact()` + opens `DayDetailModal`.

### HabitsScreen

**Per-habit reminder sync:**
- When a reminder is saved via bell + `TimePicker`, a corresponding entry is added to `settings.reminders` with `id: 'habit-{habitId}'`, `label: habit.name`, `habitId: habitId`. This makes it appear in Settings > Notifications.
- When a reminder is toggled off via the bell, the `settings.reminders` entry is updated to `enabled: false`.
- When a habit is deleted (`deleteHabit`), its `settings.reminders` entry is removed automatically.

**Add / Save / Delete haptics:**
- `+ Add` button: `lightImpact()`
- Save (Add Habit / Save Changes): `mediumImpact()`
- Delete ✕ button: `lightImpact()`
- Bell toggle: `lightImpact()`

**Pending habit link flow:**
- When `pendingHabitLinkChallenge` is set, a 400ms-delayed `useEffect` opens Add Habit modal. On save, `addHabit()` returns the new ID, `linkHabitToChallenge(challengeId, newId)` is called immediately.

**Volume slider (VolumeSlider):**
- `onPanResponderTerminationRequest: () => false` — prevents parent ScrollView from stealing the gesture.
- `onMoveShouldSetPanResponder: () => true` — keeps gesture through any vertical movement.

### ChallengeScreen

**Challenge completion logic (two paths):**

1. **Immediate archive (TodayScreen):** When `handleIncrement` detects that completing a habit makes the final day of a challenge complete (`newDaysList.length >= ch.days` and not expired), it calls `completeChallengeImmediately(ch.id)` which removes from `challenges` and adds to `pastChallenges` atomically. TodayScreen then shows `TrophyCelebration`.

2. **Calendar expiry (ChallengeScreen):** `useEffect` on `[today]` calls `archiveExpiredChallenge` for any challenge where `daysSince(startDate) >= days`. Since immediately-archived challenges are already removed from `challenges`, this never double-archives. Shows `TrophyCelebration` if tier ≠ 'none'.

**Past Challenges section:** Always rendered unconditionally. When `pastChallenges.length === 0`, shows a dashed-border card with "Completed or deleted challenges will appear here."

**Duration slider (DurationSlider):**
- Same PanResponder fixes as VolumeSlider: `onPanResponderTerminationRequest: () => false`, `onMoveShouldSetPanResponder: () => true`.

**New/Save/Delete haptics:**
- `+ New` button: `lightImpact()`
- Create / Save Changes: `mediumImpact()`
- Delete ✕ button: `lightImpact()`

### SettingsScreen

**Habit-linked reminders in Notifications section:**
- Reminders with `habitId` are displayed with the linked habit's icon + a "Habit" badge.
- Label is read-only (shows habit name, not editable).
- Toggle → syncs `enabled` back to `habit.reminder` via `updateHabit`.
- Time change → syncs new time back to `habit.reminder` + reschedules via `scheduleHabitReminder`.
- Trash → removes entry from `settings.reminders` AND disables `habit.reminder.enabled` + cancels the notification.

**Add/Delete haptics:**
- Add Reminder: `lightImpact()`
- Remove (trash): `lightImpact()`

### OnboardingScreen
3 slides, dot indicators, Next / "Let's go! 🚀" / Skip. Shown when `hasOnboarded === false`.

---

## Components

### HabitCard

**Interaction model (current):**
- The **entire card** is a `TouchableOpacity`.
  - **Daily habits:** tap anywhere → toggle done/undone (same as the checkbox, which is now a visual-only `View`).
  - **Volume habits:** tap anywhere → +1 (ignored when already at goal).
- The `−` button is the **only** way to subtract from a volume habit count.
- The `+` button (volume, not done): increments. When done: shows a visual-only `✓` badge (`View`, not tappable) — touching it does nothing extra since the card tap is also a no-op when done.
- Daily habit checkbox is a plain `View` (no onPress) — visual indicator only. The outer card handles all taps.

### TimePicker

Props: `visible`, `hour12`, `minute`, `ampm`, `onClose`, `onSave`, `theme`.
- Wheel-only. Three `WheelColumn` components: Hours (1–12), Minutes (infinite loop), AM/PM.
- `snapToInterval={ITEM_H}` + `decelerationRate="fast"`.
- Minute infinite loop: `MINUTES_LOOP = [...BASE, ...BASE, ...BASE]`. Starts scrolled to middle copy; silently jumps back if near edges.
- **Haptics:** `lightImpact()` fires in `WheelColumn.onEnd` whenever the displayed value actually changes. Save button also fires `lightImpact()`.

### TrophyCelebration

Extracted to `src/components/TrophyCelebration.js` — shared between TodayScreen and ChallengeScreen.

Props: `visible`, `onDone`, `settings`, `theme`.
- Trophy emoji scales in via `Animated.spring`.
- A dot orbits (X/Y interpolation over 1400ms).
- On orbit complete: `playHornFanfare()`, `heavyImpact` × 3 + `mediumImpact`, confetti via `CelebrationOverlay`, auto-dismiss after 3.5s.

### ProgressRing
SVG circles, stroke-dashoffset. Props: `progress`, `size`, `strokeWidth`, `color`, `bg`, `label`, `sublabel`, `sublabelColor`.

### CelebrationOverlay
30 particle squares, random positions, fall with drift/rotation, auto-dismiss 3s.

### CompletionCelebration
Full-screen expanding circle + 60 confetti pieces. `primaryColor` prop. Auto-dismiss 3.8s or tap.

---

## Bottom Sheet Pattern (canonical)

Used in: HabitsScreen, ChallengeScreen (form, past detail, habit link), ProgressScreen (day detail).

1. `Modal` with `animationType="none"` + `transparent`.
2. `internalVisible` state controlled by `useSheetAnim()` hook.
3. `useEffect` on `visible`: if true → set visible + `Animated.spring(translateY, {toValue:0})`; if false → `animateClose()`.
4. Close animation: `Animated.timing(translateY, {toValue: SCREEN_HEIGHT, duration:220})` → `setInternalVisible(false)` → call `onClose()`.
5. Drag handle: `PanResponder` with `dy > 80` threshold.
6. Structure: `<Modal><KeyboardAvoidingView><TouchableWithoutFeedback><overlayBg/></TouchableWithoutFeedback><Animated.View sheet>…</Animated.View></KeyboardAvoidingView></Modal>`
7. `overlay: { flex:1, justifyContent:'flex-end' }`, `overlayBg: { ...absoluteFill, bg:'rgba(0,0,0,0.5)' }`.
8. Sheet `paddingBottom: Platform.OS === 'ios' ? 40 : 24`.
9. **Never** use `animationType="slide"` with custom pan — they conflict.

---

## Utilities

### sounds.js
- **Static imports** of expo-audio and expo-file-system (not dynamic `require`).
- **Web:** `window.AudioContext` oscillator.
- **Native:** `buildWAV()` generates PCM sine wave → `uint8ToBase64()` (8192-byte chunks) → writes to `FileSystem.cacheDirectory` → plays with `Audio.Sound`. File existence verified before using cached URI (OS can clear cache).
- `ensureAudioMode()` sets `playsInSilentModeIOS: true`, `shouldDuckAndroid: true` once.
- Exports: `playChime()`, `playSuccessChime()`, `playChallengeChime()`, `playHornFanfare()`.

### haptics.js
- `lightImpact()`, `mediumImpact()`, `heavyImpact()`, `successNotification()`.
- `tryHaptic()` catches expo-haptics errors → `Vibration.vibrate(30)` fallback.
- All no-op on web.

**Haptic placement across the app:**
| Action | Haptic |
|---|---|
| TimePicker wheel scrolls to new value | `lightImpact` |
| TimePicker Save button | `lightImpact` |
| Habit bell toggle | `lightImpact` |
| Habits: + Add / Edit open | `lightImpact` |
| Habits: Save (modal) | `mediumImpact` |
| Habits: Delete ✕ | `lightImpact` |
| Challenge: + New | `lightImpact` |
| Challenge: Create / Save | `mediumImpact` |
| Challenge: Delete ✕ | `lightImpact` |
| Settings: Add Reminder | `lightImpact` |
| Settings: Remove (trash) | `lightImpact` |
| Progress: period toggle (7d/30d/90d) | `lightImpact` |
| Progress: bar tap | `lightImpact` |
| Progress: heatmap cell tap | `lightImpact` |
| Today: habit increment (individual) | `mediumImpact` |
| Today: all habits complete | `hapticFillSequence` (burst) |
| Challenge complete (trophy) | `heavyImpact` × 3 + `mediumImpact` |

### notifications.js
- `requestPermissions()`, `scheduleDaily()`, `scheduleHabitReminder(habit)`, `applyAllReminders(settings)`, `cancelNotification(identifier)`, `cancelAll()`.
- Reminder identifiers: `reminder-{id}` for general, `habit-{habitId}` for per-habit.
- Legacy identifiers `morning-reminder` / `evening-reminder` cancelled on migration.

### storage.js
- `saveData(key, value)`, `loadData(key)`, `clearData(key)`, `clearAll()`.

---

## Theme System (`src/theme/colors.js`)

| Token | Light | Dark |
|---|---|---|
| `bg` | `#F9FAFB` | `#0F172A` |
| `surface` | `#FFFFFF` | `#1E293B` |
| `primary` | `#4F46E5` | `#818CF8` |
| `primaryLight` | `#EEF2FF` | `#1E1B4B` |
| `text` | `#111827` | `#F8FAFC` |
| `textMuted` | `#6B7280` | `#CBD5E1` |
| `border` | `#E5E7EB` | `#334155` |
| `success` | `#10B981` | `#34D399` |
| `warning` | `#F59E0B` | `#FBBF24` |
| `danger` | `#EF4444` | `#F87171` |
| `tabBar` | `#FFFFFF` | `#1E293B` |
| `progressBarBg` | `#E5E7EB` | `#334155` |

Heatmap partial-completion uses hardcoded `#FDE68A` (consistent across themes).

---

## Key Behaviors & Design Decisions

### Auto-claim stale closure pitfall
Never call `isChallengeHabitsDone()` or `isAllDone()` inside a `setTimeout` in `handleIncrement`. The `useCallback` closure captures old state versions. Solution: compute inline immediately after `justCompleted === true`, treating the just-completed habit as done and using pre-increment `completions[todayStr()]` for all others.

### allDoneCelebrated must reset on date change
`allDoneCelebrated` is a `useRef(false)`. Without resetting it on day change, the first "Mark All" on a new simulated day (via dev date offset) silently skips the completion animation. The `useEffect([today])` reset in TodayScreen is the fix.

### completeChallengeImmediately vs archiveExpiredChallenge
- `completeChallengeImmediately` is called from TodayScreen when the user finishes the final day of a challenge early. It both marks the day AND archives atomically in one `setChallenges` functional update — the two operations compose correctly in React 18 batching.
- `archiveExpiredChallenge` is called from ChallengeScreen on mount for challenges whose calendar period has elapsed. Since `completeChallengeImmediately` removes the challenge from `challenges`, the ChallengeScreen useEffect will never find it — no double-archive.

### HabitLinkModal live data
Always pass `challengeId` (string) + `challenges` (array) to the modal. Never snapshot the challenge object. The modal re-derives `challenge = challenges.find(c => c.id === challengeId)` on every render so toggles are immediately visible.

### Challenge day tracking is date-string-based
`completedDays` stores `'YYYY-MM-DD'` strings. Day badges compute their date as `startDate + i days` and check `completedDays.includes(that date)`. Correct display even when days are skipped.

### Slider PanResponder fix
Both `VolumeSlider` (HabitsScreen) and `DurationSlider` (ChallengeScreen) require:
```js
onMoveShouldSetPanResponder: () => true,
onPanResponderTerminationRequest: () => false,
```
Without these, any vertical movement while dragging causes the parent `ScrollView` to steal the gesture.

### Habit reminders sync with Settings
When a user sets a reminder via the bell icon, a mirrored entry with `habitId` is added to `settings.reminders`. This makes it appear in Settings > Notifications with the same toggle/time/delete UI. Changes in Settings sync back to `habit.reminder` via `updateHabit`. Deleting a habit cleans up its settings entry. Labels for habit-linked reminders are read-only (set to the habit name).

### 7d heatmap always one row
The 7-day period uses `flex: 1` + `aspectRatio: 1` per cell in a non-wrapping `flexDirection: 'row'`. This guarantees exactly 7 square cells fit regardless of screen width, avoiding the `Math.floor` rounding issue that caused cells to wrap.

### HEAT_INNER constant
Must match actual inner content width: `SCREEN_WIDTH - 90` = SCREEN_WIDTH - (scroll padding 48) - (card padding 40) - (border 2). If card padding is changed, update this constant.

### Rules of Hooks in AppNavigator
All hooks before `if (!hasOnboarded) return <OnboardingScreen />`. Failure = "rendered fewer hooks than expected" crash when `resetAll()` flips `hasOnboarded` back to false.

### Bottom sheet / modal open tracking
Every screen that shows a bottom sheet calls `setModalOpen(true/false)`. AppNavigator syncs this to `modalOpenRef` and checks it in `PanResponder.onMoveShouldSetPanResponder`. Without this, swiping on the overlay behind a modal navigates screens.

### `addHabit()` returns the new ID
Changed from `void` to return the new habit's ID string, so HabitsScreen can immediately call `linkHabitToChallenge(pendingChallengeId, newId)`.

### TodayScreen status bar
`SafeAreaView` bg = `theme.primary` extends the header color into the iOS status bar area. `ScrollView` has `style={{ backgroundColor: theme.bg }}`. `StatusBar` is set globally in App.js.

### Sound file cache invalidation
`sounds.js` calls `FileSystem.getInfoAsync(uri)` before reusing a cached file path. If iOS cleared the cache directory, the WAV is regenerated.

### `resetAll()` is synchronous UI
`storeClearAll()` + all React state reset in one function. AppNavigator shows OnboardingScreen instantly — no restart.

### Daily snapshot for historical accuracy
`dailySnapshot` written via `useEffect` whenever `habits` changes. `getLastNDays()` uses snapshot per date so deleting habits doesn't retroactively change past totals. Falls back to current `habits` if no snapshot.

---

## Permissions Required

| Permission | Used by |
|---|---|
| Notifications | expo-notifications (general reminders + habit-specific reminders) |
| Camera | expo-image-picker (custom habit icons) |
| Photo Library | expo-image-picker (custom habit icons) |
| Vibration (Android) | React Native Vibration API (haptic fallback) |

---

## Known Remaining Items / Future Work

- Notification reminders scheduled but not verified to fire in Expo Go on all devices.
- Sounds (expo-audio WAV) work on iOS; Android behavior varies by device audio state.
- Custom habit icon URIs are local device paths — do not persist across device reinstalls.
- Challenge `completedDays` are date strings — if user changes device clock or uses dev date offset, past completions remain correctly associated with their original dates.
- `pendingHabitLinkChallenge` uses a 400ms delay before opening the modal to let the tab slide animation finish.
- `allDoneCelebrated` ref resets on any decrement → celebration fires again if user unchecks and re-checks all habits (intentional).
- Habit-linked reminders in Settings show the label as non-editable. If the habit is renamed, the label in Settings does not auto-update (it stays as the name at time of reminder creation). Trashing and re-adding the reminder will refresh it.
