import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, useColorScheme, Linking, Alert, Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import * as QuickActions from 'expo-quick-actions';
import { parseDeepLink, isRouteAllowed } from '../utils/links';
import {
  isGoalMet, justMetGoal, STARTER_HABITS, countAfterIncrement, applyMarkRest, revertMarkRest,
} from '../utils/habits';
import { refreshWidget } from '../widgets/refreshWidget';
import { configurePurchases, checkPro, FREE_LIMITS } from '../services/entitlements';
import { loadData, saveData, clearAll as storeClearAll } from '../utils/storage';
import { themes } from '../theme/colors';
import { useAuth } from './AuthContext';
import {
  pullAllData, pullChangesSince, pushAllLocalData, deleteAllUserData,
  syncHabit, deleteHabitSync,
  syncCompletion, syncCompletionsForDate, syncNote, syncMood,
  syncChallenge, deleteChallengeSync, syncPastChallenge,
  syncSettings,
} from '../services/sync';
import {
  requestReminderSchedule, clearRemindersOnSignOut, requestEveningCheckIn,
  getPermissionState, requestOsPermission, listenForNotificationResponses, snoozeNotification, setBadge,
  ACTION_DONE, ACTION_SNOOZE, BACKOFF_AFTER_MISSES,
} from '../utils/notifications';
import { localDateKey, todayKey, addDays } from '../utils/dates';
import { deriveAccountCreatedAt } from '../utils/accountCreatedAt';
import { overallStreak, bestOverallStreak, overallDayStatus, reconcileFreezes, freezesLeftInMonth } from '../utils/streaks';
import { normalizeSchedule, isScheduledOn, isSatisfiedOn, habitStreak } from '../utils/schedule';
import { loadDevMode, saveDevMode } from '../utils/devMode';
import { isChallengeExpired } from '../utils/challenges';
import { mergeRecords, mergeCompletions, mergeSnapshots, mergeNotes } from '../utils/mergeSync';
import { snapshotOf, isHabitDoneOnDay, makeDayRules, stampCreatedAt, earliestCreatedAt } from '../utils/dayStatus';
import { buildSeed, applySeedCompletions, applySeedSnapshot, backdateCreatedAt, seededRandom, DEMO_SEED } from '../utils/seed';
import { mergeBackup } from '../utils/backup';
import { initAnalytics, track, Events } from '../utils/analytics';
import { mockupParams, onMockupMessage, postToMockupHost } from '../utils/mockup';
import { persistPickedIcon, uploadIcon, downloadIcon, removeIcon, isDurableLocalUri, localIconExists } from '../services/icons';
import { t, useLocale } from '../i18n';
import feedback, { EVENTS as FEEDBACK } from '../services/feedback';
import { DEFAULT_SETTINGS, migrateSettings } from '../utils/settings';
import { ThemeContext } from '../theme/ThemeContext';

// The one feedback gate (src/services/feedback.js): callers never check these settings.
const applyFeedbackSettings = (s) => feedback.configure({ haptics: s?.hapticsEnabled !== false, sound: s?.soundEnabled !== false });

const AppContext = createContext(null);

const DEFAULT_HABITS = [
  { id: '1', name: 'Drink 8 glasses of water', icon: '💧', type: 'volume', volumeGoal: 8, createdAt: '2025-01-01' },
  { id: '2', name: 'Exercise for 30 minutes', icon: '🏃', type: 'daily', volumeGoal: 1, createdAt: '2025-01-01' },
  { id: '3', name: 'Read for 20 minutes', icon: '📚', type: 'daily', volumeGoal: 1, createdAt: '2025-01-01' },
  { id: '4', name: 'Meditate', icon: '🧘', type: 'daily', volumeGoal: 1, createdAt: '2025-01-01' },
];

// Labels are translated on read so a locale change applies without a reload.
export const STREAK_MILESTONES = [
  { days: 7, emoji: '🥉', get label() { return t('milestones.week'); } },
  { days: 30, emoji: '🥈', get label() { return t('milestones.month'); } },
  { days: 100, emoji: '🥇', get label() { return t('milestones.hundred'); } },
  { days: 365, emoji: '💎', get label() { return t('milestones.year'); } },
];

// The challenge promised on the last onboarding slide. An empty linkedHabitIds means
// "every habit", so it works however many habits the user goes on to create.
function makeStarterChallenge(startDate) {
  return {
    id: Date.now().toString(),
    name: t('app.kickstart.name'),
    description: t('app.kickstart.description'),
    days: 3,
    icon: '🌱',
    completedDays: [],
    completed: false,
    startDate,
    linkedHabitIds: [],
  };
}

export function getChallengeTier(completedCount, totalDays) {
  const ratio = totalDays > 0 ? completedCount / totalDays : 0;
  if (ratio >= 1.0) return 'platinum';
  if (ratio >= 0.75) return 'gold';
  if (ratio >= 0.50) return 'silver';
  if (ratio >= 0.25) return 'copper';
  return 'none';
}

export const TIER_STYLES = {
  platinum: { bg: '#CCFFFE', border: '#22D3EE', text: '#0E7490', badge: '💎', trophy: '🏆' },
  gold:     { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', badge: '🥇', trophy: '🏆' },
  silver:   { bg: '#F1F5F9', border: '#94A3B8', text: '#475569', badge: '🥈', trophy: '🥈' },
  copper:   { bg: '#FDE8D8', border: '#CD7F32', text: '#9A3412', badge: '🥉', trophy: '🥉' },
  none:     { bg: null, border: null, text: null, badge: '📋', trophy: '📋' },
};

// Every habit carries a normalised schedule (missing = every day, the pre-schedule
// behaviour). Snapshots are rewritten the same way so history stays consistent.
// Also dates any habit that has no createdAt (from its first logged day, else today):
// an undated habit would count as existing on every day (S-08).
function migrateHabits(hs, completions = {}) {
  if (!Array.isArray(hs)) return [];
  return stampCreatedAt(hs, completions, localDateKey()).map(h => ({ ...h, schedule: normalizeSchedule(h.schedule) }));
}

// Record `habits` as `key`'s snapshot unless one with habits is already there. An
// empty snapshot is treated as missing so a stale `[]` can never stick to a day.
const withSnapshot = (prev, key, habits) => (prev[key]?.length ? prev : { ...prev, [key]: snapshotOf(habits) });

function migrateChallenges(chs) {
  if (!Array.isArray(chs)) return [];
  return chs.map(ch => {
    const migrated = { linkedHabitIds: [], ...ch };
    if (migrated.id === 'starter' && migrated.linkedHabitIds.length === 0) {
      migrated.linkedHabitIds = ['1', '2', '3', '4'];
    }
    return migrated;
  });
}

export function AppProvider({ children }) {
  const { locale } = useLocale();
  // Every habit, archived ones included. `habits` (below) is the active, ordered list
  // that the rest of the app works with.
  const [allHabits, setHabits] = useState([]);
  const [completions, setCompletions] = useState({});
  // Free-text note per completion: { 'YYYY-MM-DD': { habitId: 'text' } }.
  const [notes, setNotes] = useState({});
  // Optional daily mood 1-5: { 'YYYY-MM-DD': 4 }.
  const [moods, setMoods] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [challenges, setChallenges] = useState([]);
  const [pastChallenges, setPastChallenges] = useState([]);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dailySnapshot, setDailySnapshot] = useState({});
  const [dateOffset, setDateOffset] = useState(0);
  const [requestedTab, setRequestedTab] = useState(null);
  const [pendingHabitLinkChallenge, setPendingHabitLinkChallenge] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [accountCreatedAt, setAccountCreatedAt] = useState(null);
  const [pendingChallengeRewards, setPendingChallengeRewards] = useState([]);
  // ISO timestamp of the last successful JSON export (backup indicator in Settings).
  const [lastBackupAt, setLastBackupAt] = useState(null);
  // Developer mode: unlocked per device from Settings (tap the version label). Gates the
  // dev tools section and makes the AI coach follow the simulated date offset.
  const [devMode, setDevModeState] = useState(false);

  const { user, displayName } = useAuth();
  const userId = user?.id ?? null;
  // Holds latest state snapshot for first-login cloud migration without re-triggering sync effect
  const stateRef = useRef({});
  // Server-time cursor (ms since epoch, client clock) of the last successful cloud pull.
  // null until the login-time full pull has completed.
  const lastPulledAtRef = useRef(null);
  const pullInFlightRef = useRef(false);

  // Bumped when the app returns to the foreground and at local midnight, so everything
  // derived from todayStr() re-evaluates when the calendar date changes while the app
  // is open or suspended (streaks, challenge expiry, "today" completions).
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setClockTick(t => t + 1);
    });
    let timer;
    const armMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
      timer = setTimeout(() => { setClockTick(t => t + 1); armMidnight(); }, next - now);
    };
    armMidnight();
    return () => { sub.remove(); clearTimeout(timer); };
  }, []);

  const todayStr = useCallback(() => todayKey(dateOffset), [dateOffset, clockTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const habits = useMemo(() => allHabits
    .filter(h => !h.archived)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id)),
  [allHabits]);
  const archivedHabits = useMemo(() => allHabits.filter(h => h.archived), [allHabits]);

  // These reflect the simulated date: past challenges archived in the "future" revert to
  // active, and history only shows challenges archived on or before the simulated date.
  const effectiveChallenges = useMemo(() => {
    const today = todayStr();
    const active = challenges.map(ch => {
      const days = (ch.completedDays || []).filter(d => d <= today);
      return { ...ch, completedDays: days, completed: days.length >= ch.days };
    });
    const reverted = pastChallenges
      .filter(ch => ch.archivedAt && ch.archivedAt > today)
      .map(ch => {
        const days = (ch.completedDays || []).filter(d => d <= today);
        return { ...ch, completedDays: days, completed: false };
      });
    return [...active, ...reverted];
  }, [challenges, pastChallenges, todayStr]);

  const effectivePastChallenges = useMemo(() => {
    const today = todayStr();
    return pastChallenges.filter(ch => !ch.archivedAt || ch.archivedAt <= today);
  }, [pastChallenges, todayStr]);

  useEffect(() => { initAnalytics(); loadPersistedData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPersistedData() {
    // NOTE: userId is always null here (auth resolves asynchronously after mount).
    // Do NOT check lastUserId vs userId here — it will always look like a different user.
    // The user-switch check runs in the cloud sync effect below, where userId is known.
    const [h, c, s, ch, ob, ds, pc, aca, savedOffset, pcr, dev, n, lba, md] = await Promise.all([
      loadData('habits'),
      loadData('completions'),
      loadData('settings'),
      loadData('challenges'),
      loadData('hasOnboarded'),
      loadData('dailySnapshot'),
      loadData('pastChallenges'),
      loadData('accountCreatedAt'),
      loadData('dateOffset'),
      loadData('pendingChallengeRewards'),
      loadDevMode(),
      loadData('notes'),
      loadData('lastBackupAt'),
      loadData('moods'),
    ]);

    if (h) setHabits(migrateHabits(h, c || {}));
    if (c) setCompletions(c);
    if (n) setNotes(n);
    if (lba) setLastBackupAt(lba);
    if (md) setMoods(md);
    const loadedSettings = migrateSettings(s);
    applyFeedbackSettings(loadedSettings); // before children mount
    setSettings(loadedSettings);
    if (ch) {
      setChallenges(migrateChallenges(Array.isArray(ch) ? ch : [ch]));
    } else {
      const oldCh = await loadData('challenge');
      if (oldCh) setChallenges(migrateChallenges([oldCh]));
    }
    if (ob !== null) setHasOnboarded(ob);
    if (ds) setDailySnapshot(ds);
    if (pc) setPastChallenges(pc);
    if (aca) {
      // Clamp a stored UTC-based date that landed in the future due to timezone mismatch
      const localToday = localDateKey();
      const clamped = aca > localToday ? localToday : aca;
      if (clamped !== aca) saveData('accountCreatedAt', clamped);
      setAccountCreatedAt(clamped);
    } else {
      const firstDate = deriveAccountCreatedAt({ completions: c, habits: h });
      setAccountCreatedAt(firstDate);
      saveData('accountCreatedAt', firstDate);
    }
    if (pcr) setPendingChallengeRewards(pcr);
    setDevModeState(dev);
    // The simulated date only makes sense while dev mode is unlocked.
    if (dev && savedOffset !== null) setDateOffset(savedOffset);
    setLoaded(true);
  }

  // ── AsyncStorage persistence ─────────────────────────────────────────────────
  useEffect(() => { if (loaded) saveData('habits', allHabits); }, [allHabits, loaded]);
  useEffect(() => { if (loaded) saveData('completions', completions); }, [completions, loaded]);
  useEffect(() => { if (loaded) saveData('notes', notes); }, [notes, loaded]);
  useEffect(() => { if (loaded) saveData('moods', moods); }, [moods, loaded]);
  useEffect(() => { if (loaded) saveData('settings', settings); }, [settings, loaded]);
  // One feedback gate for the whole app (src/services/feedback.js); callers need no check.
  // The load paths above also set it synchronously so child mount effects never
  // see a stale value; this effect covers every other settings change.
  useEffect(() => applyFeedbackSettings(settings), [settings.hapticsEnabled, settings.soundEnabled]); // eslint-disable-line react-hooks/exhaustive-deps
  // Pre-render the sound kit at idle after launch (no-op when sound is off, on web, or when
  // already started), so the first chord or fanfare never renders inside a celebration.
  useEffect(() => { if (loaded && settings.soundEnabled) feedback.prewarmSounds(); }, [loaded, settings.soundEnabled]);
  useEffect(() => { if (loaded) saveData('dateOffset', dateOffset); }, [dateOffset, loaded]);
  useEffect(() => { if (loaded) saveData('challenges', challenges); }, [challenges, loaded]);
  useEffect(() => { if (loaded) saveData('hasOnboarded', hasOnboarded); }, [hasOnboarded, loaded]);
  useEffect(() => { if (loaded) saveData('dailySnapshot', dailySnapshot); }, [dailySnapshot, loaded]);
  useEffect(() => { if (loaded) saveData('pastChallenges', pastChallenges); }, [pastChallenges, loaded]);
  useEffect(() => { if (loaded && accountCreatedAt) saveData('accountCreatedAt', accountCreatedAt); }, [accountCreatedAt, loaded]);
  useEffect(() => { if (loaded) saveData('pendingChallengeRewards', pendingChallengeRewards); }, [pendingChallengeRewards, loaded]);

  useEffect(() => {
    if (!loaded) return;
    // Before onboarding there are no habits yet; writing `[today]: []` here is the
    // stale value the demo seed used to copy over the real snapshot (STA-2).
    if (!hasOnboarded && habits.length === 0) return;
    const today = todayStr();
    setDailySnapshot(prev => ({ ...prev, [today]: snapshotOf(habits) }));
  }, [habits, loaded, todayStr, hasOnboarded]);

  // Keep stateRef fresh so the cloud sync effect can access current state without
  // adding all these values to its dependency array (which would re-trigger on every mutation)
  useEffect(() => {
    stateRef.current = { habits: allHabits, completions, notes, moods, settings, challenges, pastChallenges, dailySnapshot };
  }, [allHabits, completions, notes, moods, settings, challenges, pastChallenges, dailySnapshot]);

  // ── Daily reminder scheduling ────────────────────────────────────────────────
  // Make the OS schedule match settings.reminders + habit.reminder on launch and
  // whenever either changes (including the master toggle). Keyed on the reminder
  // fields only so a completion tap does not reschedule anything.
  const habitReminderKey = JSON.stringify(habits.map(h => [h.id, h.name, h.icon, h.intention ?? null, h.reminder ?? null]));

  // Reminder back-off input: consecutive real days (before today) on which a habit
  // with a reminder was scheduled but not done. Capped so the key stays small.
  const missesByHabit = useMemo(() => {
    const realToday = localDateKey();
    const out = {};
    for (const h of habits) {
      if (!h.reminder?.enabled) continue;
      let misses = 0;
      let key = addDays(realToday, -1);
      for (let i = 0; i < 30; i++) {
        if (h.createdAt && key < h.createdAt) break;
        if (!isScheduledOn(h.schedule, key)) { key = addDays(key, -1); continue; }
        if (isGoalMet(h, (completions[key] || {})[h.id])) break;
        misses++;
        key = addDays(key, -1);
      }
      if (misses >= BACKOFF_AFTER_MISSES) out[h.id] = misses;
    }
    return out;
  }, [habits, completions, clockTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const backoffKey = JSON.stringify(missesByHabit);

  // The OS notification permission ('granted' | 'undetermined' | 'denied'; null until
  // first read). Refreshed on load and whenever the app comes back to the foreground,
  // so Settings can show a stored-on reminder that cannot fire as "Off · Tap to allow".
  const [notificationPermission, setNotificationPermission] = useState(null);
  const refreshNotificationPermission = useCallback(async () => {
    const state = await getPermissionState();
    setNotificationPermission(state);
    return state;
  }, []);
  useEffect(() => {
    refreshNotificationPermission();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshNotificationPermission(); });
    return () => sub.remove();
  }, [refreshNotificationPermission]);

  const remindersAppliedOnce = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    // Never show the OS permission dialog from the launch pass; only after the user
    // changes a reminder (which is what the later runs of this effect represent).
    // Re-runs when permission is granted, so already-stored reminders get scheduled.
    // Debounced and serialized (#186): only the latest state's pass survives, so a
    // reminder turned off cannot be re-added by an older pass still in flight.
    requestReminderSchedule(settings, habits, { prompt: false, missesByHabit, today: localDateKey() });
    remindersAppliedOnce.current = true;
  }, [loaded, settings.notificationsEnabled, settings.reminders, habitReminderKey, backoffKey, clockTick, notificationPermission]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sign-out / account switch unmounts this provider: a pass queued here must not run
  // for the next user, and the old user's reminders must stop firing. The sweep runs
  // on the scheduling chain, ahead of the next user's first pass.
  useEffect(() => () => { clearRemindersOnSignOut(localDateKey()); }, []);

  // ── Notification permission priming ──────────────────────────────────────────
  // Screens call ensureNotificationPermission() before turning a reminder on. If the
  // OS has never been asked we show our own explainer first (the OS dialog can only
  // be shown once); if the user already said no we point them at system settings.
  const [primerVisible, setPrimerVisible] = useState(false);
  const primerResolve = useRef(null);
  const ensureNotificationPermission = useCallback(async () => {
    const state = await getPermissionState();
    setNotificationPermission(state);
    if (state === 'granted') return true;
    if (state === 'denied') {
      Alert.alert(t('app.notificationsOff.title'), t('app.notificationsOff.body'), [
        { text: t('common.notNow'), style: 'cancel' },
        { text: t('app.notificationsOff.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
      return false;
    }
    const allow = await new Promise((resolve) => { primerResolve.current = resolve; setPrimerVisible(true); });
    setPrimerVisible(false);
    if (!allow) return false;
    const granted = await requestOsPermission();
    refreshNotificationPermission();
    return granted;
  }, [refreshNotificationPermission]);
  const answerPrimer = useCallback((allow) => { primerResolve.current?.(allow); primerResolve.current = null; }, []);

  // ── Notification actions (Done / Snooze / tap) ───────────────────────────────
  const actionRef = useRef(null);
  useEffect(() => {
    actionRef.current = ({ action, data, content }) => {
      if (action === ACTION_SNOOZE) { snoozeNotification(content, 60); return; }
      if (action === ACTION_DONE && data?.kind === 'habit') {
        const h = allHabits.find(x => x.id === data.habitId && !x.archived);
        if (!h) return;
        const key = localDateKey();
        setCompletions(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [h.id]: h.volumeGoal } }));
        setDailySnapshot(prev => withSnapshot(prev, key, habits));
        if (userId) syncCompletion(userId, key, h.id, h.volumeGoal);
        return;
      }
      if (action === 'open') {
        // Open the habit the reminder was about, otherwise Today.
        if (data?.kind === 'habit' && data.habitId) setPendingRoute({ tab: 3, habitId: data.habitId, action: 'open' });
        else setRequestedTab(0);
      }
    };
  }, [allHabits, habits, userId]);

  // ── Deep links & quick actions ───────────────────────────────────────────────
  // A parsed route waits here until the owning screen consumes it (habit detail,
  // new-habit sheet); tab switches are applied immediately.
  const [pendingRoute, setPendingRoute] = useState(null);
  const clearPendingRoute = useCallback(() => setPendingRoute(null), []);
  const routeRef = useRef(null);
  useEffect(() => {
    routeRef.current = (route) => {
      if (!isRouteAllowed(route, { dev: __DEV__, mockup: mockupParams.active })) return;
      if (route.action === 'done' && route.habitId) {
        const h = allHabits.find(x => x.id === route.habitId && !x.archived);
        if (h) {
          const key = localDateKey();
          setCompletions(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [h.id]: h.volumeGoal } }));
          setDailySnapshot(prev => withSnapshot(prev, key, habits));
          if (userId) syncCompletion(userId, key, h.id, h.volumeGoal);
        }
        setRequestedTab(0);
        return;
      }
      if (route.tab != null) setRequestedTab(route.tab);
      setPendingRoute(route);
    };
  }, [allHabits, habits, userId]);
  useEffect(() => {
    if (!loaded) return;
    const handle = (url) => { const r = parseDeepLink(url); if (r) routeRef.current?.(r); };
    ExpoLinking.getInitialURL().then(handle).catch(() => {});
    const sub = ExpoLinking.addEventListener('url', ({ url }) => handle(url));
    // The iOS mockup host (mockup/) navigates the embedded web build via postMessage.
    const unsubMockup = onMockupMessage((m) => {
      if (m.type === 'mockup:navigate') handle('groov://' + String(m.route || '').replace(/^\/+/, ''));
    });
    return () => { sub.remove(); unsubMockup(); };
  }, [loaded]);

  // Mockup host: `theme=` query param / `mockup:theme` message override the saved theme (web only).
  const [mockupTheme, setMockupTheme] = useState(() => mockupParams.theme);
  useEffect(() => onMockupMessage((m) => {
    if (m.type === 'mockup:theme') setMockupTheme(m.theme === 'light' || m.theme === 'dark' ? m.theme : null);
  }), []);
  // Mockup host: `demo=1` seeds starter habits and a month of history for review screenshots.
  const demoSeeded = useRef(false);
  const completeOnboardingRef = useRef(null);
  const seedRandomHistoryRef = useRef(null);
  const [cloudSynced, setCloudSynced] = useState(false); // initial cloud pull/push finished
  useEffect(() => {
    // Seed only after the initial cloud sync: habits created before it can be dropped by the pull.
    if (!loaded || !cloudSynced || !mockupParams.demo || demoSeeded.current) return;
    if (!hasOnboarded && habits.length === 0) {
      completeOnboardingRef.current?.(STARTER_HABITS.slice(0, 4).map(({ key, ...h }) => h));
    } else if (hasOnboarded && habits.length > 0) {
      demoSeeded.current = true;
      // A fixed PRNG seed makes every demo history identical, so shot matrices compare.
      if (Object.keys(completions).length < 5) seedRandomHistoryRef.current?.({ deterministic: true });
      // Finishing onboarding resets the pager to Today; re-apply the requested route.
      ExpoLinking.getInitialURL().then((url) => { const r = parseDeepLink(url); if (r) routeRef.current?.(r); }).catch(() => {});
    }
  }, [loaded, cloudSynced, hasOnboarded, habits.length, completions]);

  // Home-screen quick actions (long-press the app icon).
  useEffect(() => {
    if (!loaded || Platform.OS === 'web') return;
    try {
      QuickActions.setItems([
        // Icons: SF Symbols on iOS; Android falls back to the app icon when the named
        // drawable is absent, which is fine for now.
        { id: 'today', title: t('app.quickActions.today'), subtitle: t('app.quickActions.todaySubtitle'), icon: Platform.OS === 'ios' ? 'symbol:checkmark.circle' : undefined, params: { href: 'groov://today' } },
        { id: 'new-habit', title: t('app.quickActions.newHabit'), icon: Platform.OS === 'ios' ? 'symbol:plus' : undefined, params: { href: 'groov://habits/new' } },
        { id: 'progress', title: t('app.quickActions.progress'), icon: Platform.OS === 'ios' ? 'symbol:chart.bar' : undefined, params: { href: 'groov://progress' } },
      ]);
    } catch {}
    const onAction = (a) => { const href = a?.params?.href; if (href) { const r = parseDeepLink(href); if (r) routeRef.current?.(r); } };
    if (QuickActions.initial) onAction(QuickActions.initial);
    const sub = QuickActions.addListener(onAction);
    return () => sub.remove();
  }, [loaded, locale]);
  useEffect(() => {
    if (!loaded) return;
    return listenForNotificationResponses((evt) => actionRef.current?.(evt));
  }, [loaded]);

  // ── Groov Pro ────────────────────────────────────────────────────────────────
  // `isPro` comes from profiles.is_pro (set by the RevenueCat webhook) or a live
  // RevenueCat entitlement. `paywall` is the sheet request screens consume.
  const [isPro, setIsPro] = useState(false);
  const [paywall, setPaywall] = useState(null); // { reason } | null
  const openPaywall = useCallback((reason) => setPaywall({ reason }), []);
  const closePaywall = useCallback(() => setPaywall(null), []);
  const refreshPro = useCallback(async () => {
    if (!userId) { setIsPro(false); return false; }
    const v = await checkPro(userId).catch(() => false);
    setIsPro(v);
    return v;
  }, [userId]);
  useEffect(() => {
    if (!loaded || !userId) return;
    configurePurchases(userId).finally(refreshPro);
  }, [loaded, userId, clockTick]); // eslint-disable-line react-hooks/exhaustive-deps
  // Free-tier checks. Each returns true when the action may proceed, otherwise opens
  // the paywall with the matching reason.
  const canAddHabit = useCallback(() => {
    if (isPro || habits.length < FREE_LIMITS.habits) return true;
    feedback.play(FEEDBACK.refused);
    openPaywall('habits');
    return false;
  }, [isPro, habits.length, openPaywall]);
  const canAddReminder = useCallback(() => {
    if (isPro || (settings.reminders || []).length < FREE_LIMITS.reminders) return true;
    feedback.play(FEEDBACK.refused);
    openPaywall('reminders');
    return false;
  }, [isPro, settings.reminders, openPaywall]);

  // ── Home-screen widget ───────────────────────────────────────────────────────
  // Re-render the Android widget when today's data changes, and absorb check-offs
  // the widget wrote while the app was closed (widgetPendingSync) into the cloud.
  useEffect(() => {
    if (!loaded) return;
    refreshWidget({ habits: allHabits, completions, settings, today: localDateKey() });
  }, [loaded, allHabits, completions, settings.theme, clockTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loaded || !userId) return;
    (async () => {
      const pending = await loadData('widgetPendingSync');
      if (!Array.isArray(pending) || pending.length === 0) return;
      await saveData('widgetPendingSync', []);
      // Completions were already written to AsyncStorage by the widget; our state was
      // loaded from that same storage, so only the cloud needs the rows.
      for (const p of pending) syncCompletion(userId, p.date, p.habitId, p.count);
    })();
  }, [loaded, userId, clockTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── App icon badge: habits still to do today ─────────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    const realToday = localDateKey();
    const left = habits.filter(h => isScheduledOn(h.schedule, realToday)
      && !isSatisfiedOn(h.schedule, realToday, (k) => isHabitDoneOnDay(h, k, completions) === true)).length;
    setBadge(settings.notificationsEnabled ? left : 0);
  }, [loaded, habits, completions, settings.notificationsEnabled, clockTick]);

  // ── Smart check-in (evening) scheduling ──────────────────────────────────────
  // Reschedule (or cancel) the evening habit reminder whenever completions or
  // relevant settings change. Uses real today — not the dev date offset — so the
  // notification fires at the right wall-clock time.
  useEffect(() => {
    if (!loaded) return;
    const realToday = localDateKey();
    // Serialized with the reminder passes (#186) so the latest state wins.
    if (!settings.eveningReminderEnabled || !settings.notificationsEnabled) {
      requestEveningCheckIn(realToday, { schedule: false });
      return;
    }
    const due = habits.filter(h => isScheduledOn(h.schedule, realToday));
    const allDone = due.length > 0 && due.every(h =>
      isSatisfiedOn(h.schedule, realToday, (k) => isHabitDoneOnDay(h, k, completions) === true));
    requestEveningCheckIn(realToday, allDone
      ? { schedule: false }
      : { schedule: true, hour: settings.eveningReminderHour ?? 20, minute: settings.eveningReminderMinute ?? 0 });
  }, [completions, habits, settings.eveningReminderEnabled, settings.notificationsEnabled, settings.eveningReminderHour, settings.eveningReminderMinute, loaded, clockTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cloud sync ───────────────────────────────────────────────────────────────
  // Runs once when the user logs in (userId changes from null → id) and after local data loads.
  // This is also where we detect account switches: userId is known here (unlike loadPersistedData).
  useEffect(() => {
    if (!loaded || !userId) return;
    const sync = async () => {
      try {
        const [lastUserId, accountWasDeleted] = await Promise.all([
          loadData('lastUserId'),
          loadData('accountWasDeleted'),
        ]);

        // An empty state to reset to when switching/deleting accounts. Resetting stateRef
        // here (not just the React setters) ensures pushAllLocalData sends empty data
        // synchronously before React re-renders propagate the setter calls.
        const emptyState = { habits: [], completions: {}, notes: {}, moods: {}, settings: DEFAULT_SETTINGS, challenges: [], pastChallenges: [], dailySnapshot: {} };
        // The account's first day as stored on this device. A switch or deletion drops it:
        // the in-memory value belongs to the previous user and is recomputed after the pull.
        let storedAca = await loadData('accountCreatedAt');
        const settleAccountCreatedAt = (completionsForAca, habitsForAca) => {
          const next = deriveAccountCreatedAt({ stored: storedAca, completions: completionsForAca, habits: habitsForAca });
          setAccountCreatedAt(next);
          // Save even when it equals the in-memory value: a switch wiped the stored key.
          saveData('accountCreatedAt', next);
        };

        if (accountWasDeleted) {
          // Account was explicitly deleted — the previous user's storage was already wiped in
          // AuthContext.deleteAccount(). Just clear the sentinel and reset in-memory state.
          await saveData('accountWasDeleted', null);
          stateRef.current = emptyState;
          storedAca = null;
          // Today until the pull below lowers it, so a failed (offline) pull never
          // leaves the previous user's date in memory.
          settleAccountCreatedAt(null, null);
          setHabits([]);
          setCompletions({});
          setNotes({});
          setMoods({});
          setHasOnboarded(false);
          setChallenges([]);
          setPastChallenges([]);
          setDailySnapshot({});
          setSettings(DEFAULT_SETTINGS);
          applyFeedbackSettings(DEFAULT_SETTINGS);
        } else if (lastUserId !== null && lastUserId !== userId) {
          // Different user logged in on this device — wipe the previous user's local data.
          await storeClearAll();
          stateRef.current = emptyState;
          storedAca = null;
          // Today until the pull below lowers it, so a failed (offline) pull never
          // leaves the previous user's date in memory.
          settleAccountCreatedAt(null, null);
          setHabits([]);
          setCompletions({});
          setNotes({});
          setMoods({});
          // A brand-new user (e.g. a guest) on this device gets the onboarding flow;
          // a returning user is flipped back to true below when the cloud has data.
          setHasOnboarded(false);
          setChallenges([]);
          setPastChallenges([]);
          setDailySnapshot({});
          // The previous user's settings must not carry over either: their reminders
          // would show as on for an account that never granted anything (S-05).
          setSettings(DEFAULT_SETTINGS);
          applyFeedbackSettings(DEFAULT_SETTINGS);
        }
        await saveData('lastUserId', userId);

        const cloudData = await pullAllData(userId);

        // One-time migration: if cloud only has the hardcoded legacy default habits
        // (ids '1'–'4'), the user never customised anything — wipe them so the app
        // starts clean. User-created habits always have Date.now() ids (13-digit ms
        // timestamps), so this check can never fire for real user data.
        const cloudHabits = cloudData.habits ?? [];
        const hasOnlyLegacyDefaults =
          cloudHabits.length > 0 &&
          cloudHabits.every(h => ['1', '2', '3', '4'].includes(h.id));
        if (hasOnlyLegacyDefaults) {
          await deleteAllUserData(userId).catch(() => {});
          stateRef.current = emptyState;
          setHabits([]);
          setCompletions({});
          setChallenges([]);
          setPastChallenges([]);
          setDailySnapshot({});
          settleAccountCreatedAt(null, null);
          return;
        }

        const pulledAt = Date.now();
        const hasCloudData = cloudData.habits !== null && cloudData.habits.length > 0;
        if (hasCloudData) {
          setHabits(migrateHabits(cloudData.habits, cloudData.completions || {}));
          if (cloudData.completions) setCompletions(cloudData.completions);
          if (cloudData.notes) setNotes(cloudData.notes);
          if (cloudData.moods) setMoods(cloudData.moods);
          if (cloudData.settings) {
            const cloudSettings = migrateSettings(cloudData.settings);
            applyFeedbackSettings(cloudSettings);
            setSettings(cloudSettings);
          }
          if (cloudData.challenges) setChallenges(migrateChallenges(cloudData.challenges));
          if (cloudData.pastChallenges) setPastChallenges(cloudData.pastChallenges);
          if (cloudData.dailySnapshot) setDailySnapshot(cloudData.dailySnapshot);
          setHasOnboarded(true);
          settleAccountCreatedAt(cloudData.completions, cloudData.habits);
        } else {
          await pushAllLocalData(userId, stateRef.current);
          settleAccountCreatedAt(stateRef.current.completions, stateRef.current.habits);
        }
        lastPulledAtRef.current = pulledAt;
      } catch (e) {
        if (__DEV__) console.warn('Cloud sync error:', e.message);
      } finally {
        setCloudSynced(true);
      }
    };
    sync();
  }, [userId, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Foreground pull ──────────────────────────────────────────────────────────
  // When the app returns to the foreground, fetch everything the server has changed
  // since the last pull (another device, or a push that completed while suspended)
  // and merge it over local state. Deletions are reconciled against the cloud id lists.
  useEffect(() => {
    if (!loaded || !userId || clockTick === 0) return;
    const since = lastPulledAtRef.current;
    if (!since || pullInFlightRef.current) return;
    pullInFlightRef.current = true;
    const startedAt = Date.now();
    // Generous margin for client/server clock skew; re-applying unchanged rows is harmless.
    const sinceIso = new Date(since - 10 * 60 * 1000).toISOString();
    pullChangesSince(userId, sinceIso)
      .then((delta) => {
        const sinceMs = since;
        if (delta.habits.length || delta.habitIds) {
          setHabits(prev => migrateHabits(mergeRecords(prev, delta.habits, delta.habitIds, sinceMs))
            .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id)));
        }
        if (delta.challenges.length || delta.challengeIds) {
          setChallenges(prev => migrateChallenges(mergeRecords(prev, delta.challenges, delta.challengeIds, sinceMs)));
        }
        if (delta.pastChallenges.length) {
          setPastChallenges(prev => mergeRecords(prev, delta.pastChallenges, null, sinceMs));
        }
        if (delta.completions.length) {
          setCompletions(prev => mergeCompletions(prev, delta.completions));
          setNotes(prev => mergeNotes(prev, delta.completions));
        }
        if (delta.completions.length || delta.habits.length) {
          // Real history from another device can only move the first day earlier;
          // deleted rows (count 0) and future dates never count.
          const pulledCompletions = mergeCompletions({}, delta.completions);
          setAccountCreatedAt(prev => (prev
            ? deriveAccountCreatedAt({ stored: prev, completions: pulledCompletions, habits: delta.habits })
            : prev));
        }
        if (delta.dailySnapshots.length) setDailySnapshot(prev => mergeSnapshots(prev, delta.dailySnapshots, todayStr()));
        if (delta.moods?.length) setMoods(prev => { const next = { ...prev }; for (const r of delta.moods) next[r.date] = r.mood; return next; });
        if (delta.settings) {
          const pulledSettings = migrateSettings(delta.settings);
          applyFeedbackSettings(pulledSettings);
          setSettings(pulledSettings);
        }
        lastPulledAtRef.current = startedAt;
      })
      .catch((e) => { if (__DEV__) console.warn('Foreground pull failed:', e.message); })
      .finally(() => { pullInFlightRef.current = false; });
  }, [clockTick, loaded, userId]);

  // ── Completion helpers ───────────────────────────────────────────────────────

  const getTodayCompletions = useCallback(() => completions[todayStr()] || {}, [completions, todayStr]);

  const getHabitCount = useCallback((habitId) => {
    const today = completions[todayStr()] || {};
    return today[habitId] || 0;
  }, [completions, todayStr]);

  const isHabitDone = useCallback((habit) => {
    return isGoalMet(habit, getHabitCount(habit.id));
  }, [getHabitCount]);

  // Goal met on `key` (any date) for a habit. Days before the habit existed never
  // count (matters for 'atMost', where an untouched day is otherwise a success).
  // The shared rule lives in utils/dayStatus.js; 'before' reads as not done here.
  const isHabitDoneOn = useCallback((habit, key) => isHabitDoneOnDay(habit, key, completions) === true, [completions]);

  // Habits the Today screen shows: everything scheduled today. perWeek habits are
  // always available so the user can log them on any day they choose.
  const dueHabits = useMemo(() => {
    const today = todayStr();
    return habits.filter(h => isScheduledOn(h.schedule, today));
  }, [habits, todayStr]);

  // "Counts as done today": goal met, or nothing was asked of the habit today
  // (a perWeek habit whose weekly target is already met).
  const isHabitSatisfied = useCallback((habit) => {
    return isSatisfiedOn(habit.schedule, todayStr(), (k) => isHabitDoneOn(habit, k));
  }, [isHabitDoneOn, todayStr]);

  // Same rule, but judged against `todayCounts` (a post-action map) for today, so a
  // caller can decide before React has applied its own setCompletions.
  const isHabitSatisfiedWith = useCallback((habit, todayCounts) => {
    const today = todayStr();
    return isSatisfiedOn(habit.schedule, today, (k) => {
      if (k !== today) return isHabitDoneOn(habit, k);
      return isHabitDoneOnDay(habit, k, { [today]: todayCounts || {} }) === true;
    });
  }, [isHabitDoneOn, todayStr]);

  const getCompletedCount = useCallback(() => {
    return dueHabits.filter(h => isHabitSatisfied(h)).length;
  }, [dueHabits, isHabitSatisfied]);

  const isAllDone = useCallback(() => {
    return dueHabits.length > 0 && dueHabits.every(h => isHabitSatisfied(h));
  }, [dueHabits, isHabitSatisfied]);

  const isChallengeHabitsDone = useCallback((challenge) => {
    const ids = challenge.linkedHabitIds || [];
    const relevant = ids.length > 0 ? dueHabits.filter(h => ids.includes(h.id)) : dueHabits;
    return relevant.length > 0 && relevant.every(h => isHabitSatisfied(h));
  }, [dueHabits, isHabitSatisfied]);

  // ── Habit mutations ──────────────────────────────────────────────────────────

  // Add `amount` (default 1; timed habits add minutes). Daily/quit habits cap at 1;
  // counters may exceed their goal. Returns true when this call met the goal.
  const incrementHabit = useCallback((habitId, amount = 1) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return false;
    const today = todayStr();
    const current = (completions[today] || {})[habitId] || 0;
    const capped = habit.type === 'daily' || habit.type === 'quit' || !habit.type;
    if (capped && current >= 1) return false;
    const next = countAfterIncrement(habit, current, amount);
    setCompletions(prev => ({
      ...prev,
      [today]: { ...(prev[today] || {}), [habitId]: next },
    }));
    setDailySnapshot(prev => withSnapshot(prev, today, habits));
    if (userId) syncCompletion(userId, today, habitId, next);
    const met = justMetGoal(habit, current, next);
    if (met) track(Events.COMPLETION, { type: habit.type });
    return met;
  }, [completions, habits, todayStr, userId]);

  const decrementHabit = useCallback((habitId, amount = 1) => {
    const today = todayStr();
    const current = (completions[today] || {})[habitId] || 0;
    if (current <= 0) return;
    const next = Math.max(0, current - Math.max(1, Math.round(amount)));
    setCompletions(prev => ({
      ...prev,
      [today]: { ...(prev[today] || {}), [habitId]: next },
    }));
    if (userId) syncCompletion(userId, today, habitId, next);
  }, [completions, todayStr, userId]);

  // Set a habit's count on any past day (edit yesterday, habit detail calendar).
  // Future days are refused. The snapshot for that day is backfilled from the live
  // list when none exists so history stays consistent.
  const setHabitCountOn = useCallback((habitId, key, count) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit || key > todayStr()) return;
    const next = Math.max(0, Math.round(count));
    setCompletions(prev => {
      const day = { ...(prev[key] || {}) };
      if (next > 0) day[habitId] = next; else delete day[habitId];
      const out = { ...prev };
      if (Object.keys(day).length > 0) out[key] = day; else delete out[key];
      return out;
    });
    setDailySnapshot(prev => withSnapshot(prev, key, habits));
    if (userId) syncCompletion(userId, key, habitId, next);
  }, [habits, todayStr, userId]);

  const toggleHabitDoneOn = useCallback((habitId, key) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    const done = isGoalMet(habit, (completions[key] || {})[habitId]);
    // For a limit habit "toggle" means clear vs go over; otherwise clear vs meet the goal.
    const doneValue = habit.type === 'atMost' ? habit.volumeGoal + 1 : (habit.type === 'volume' || habit.type === 'timed' ? habit.volumeGoal : 1);
    setHabitCountOn(habitId, key, done ? (habit.type === 'atMost' ? doneValue : 0) : (habit.type === 'atMost' ? 0 : doneValue));
  }, [habits, completions, setHabitCountOn]);

  // Make a freshly picked icon durable: copy it next to the app data and upload it to
  // the private bucket. Runs after the habit is saved so the UI never waits on it.
  const adoptIcon = useCallback(async (habit) => {
    const uri = habit.customIconUri;
    if (!uri || isDurableLocalUri(uri)) return;
    let localUri = uri;
    try { localUri = persistPickedIcon(habit.id, uri); } catch (e) { if (__DEV__) console.warn('persistPickedIcon:', e?.message); }
    let iconStoragePath = habit.iconStoragePath ?? null;
    try { iconStoragePath = (await uploadIcon(userId, habit.id, localUri)) ?? iconStoragePath; } catch (e) { if (__DEV__) console.warn('uploadIcon:', e?.message); }
    const updates = { customIconUri: localUri, iconStoragePath };
    setHabits(prev => prev.map(h => (h.id === habit.id ? { ...h, ...updates } : h)));
    if (userId) syncHabit(userId, { ...habit, ...updates });
  }, [userId]);

  const addHabit = useCallback((habit) => {
    const sortOrder = habits.reduce((m, h) => Math.max(m, h.sortOrder ?? 0), -1) + 1;
    const newHabit = { ...habit, schedule: normalizeSchedule(habit.schedule), sortOrder, id: Date.now().toString(), createdAt: todayStr() };
    setHabits(prev => [...prev, newHabit]);
    if (userId) syncHabit(userId, newHabit);
    adoptIcon(newHabit);
    track(Events.HABIT_CREATED, { type: newHabit.type, schedule: newHabit.schedule.type, timeOfDay: newHabit.timeOfDay || 'anytime' });
    return newHabit.id;
  }, [habits, todayStr, userId, adoptIcon]);

  const updateHabit = useCallback((id, updates) => {
    if (updates.schedule) updates = { ...updates, schedule: normalizeSchedule(updates.schedule) };
    const before = allHabits.find(h => h.id === id);
    // Switching back to an emoji drops the stored image too.
    if ('customIconUri' in updates && !updates.customIconUri && before?.iconStoragePath) {
      updates = { ...updates, iconStoragePath: null };
      removeIcon(userId, id, before.iconStoragePath);
    }
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...updates } : h));
    if (userId && before) syncHabit(userId, { ...before, ...updates });
    if (updates.customIconUri && updates.customIconUri !== before?.customIconUri) adoptIcon({ ...before, ...updates, id });
  }, [allHabits, userId, adoptIcon]);

  // Keep custom icons available: download ones another device uploaded, adopt
  // legacy cache URIs that still resolve, and fall back to the emoji otherwise.
  const iconCheckRef = useRef(new Set());
  useEffect(() => {
    if (!loaded) return;
    allHabits.forEach(async (h) => {
      const key = `${h.id}|${h.customIconUri ?? ''}|${h.iconStoragePath ?? ''}`;
      if (iconCheckRef.current.has(key)) return;
      iconCheckRef.current.add(key);
      if (h.customIconUri && isDurableLocalUri(h.customIconUri) && localIconExists(h.customIconUri)) return;
      if (h.iconStoragePath && userId) {
        // Clear first so the Image remounts with a fresh URI once the file is back.
        if (h.customIconUri) setHabits(prev => prev.map(x => (x.id === h.id ? { ...x, customIconUri: null } : x)));
        const local = await downloadIcon(h.iconStoragePath, h.id);
        setHabits(prev => prev.map(x => (x.id === h.id ? { ...x, customIconUri: local || null } : x)));
        return;
      }
      if (h.customIconUri && !isDurableLocalUri(h.customIconUri)) {
        if (localIconExists(h.customIconUri)) adoptIcon(h);
        else setHabits(prev => prev.map(x => (x.id === h.id ? { ...x, customIconUri: null, icon: x.icon || '⭐' } : x)));
      }
    });
  }, [loaded, allHabits, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Archive keeps the history (heatmap, snapshots, streak past) but removes the habit
  // from Today, reminders and challenges-to-claim. Reversible from the Habits screen.
  const archiveHabit = useCallback((id) => updateHabit(id, { archived: true, reminder: undefined }), [updateHabit]);
  const unarchiveHabit = useCallback((id) => updateHabit(id, { archived: false }), [updateHabit]);

  // Move a habit one slot up or down in the active list and persist the new order.
  const moveHabit = useCallback((id, delta) => {
    const idx = habits.findIndex(h => h.id === id);
    const to = idx + delta;
    if (idx < 0 || to < 0 || to >= habits.length) return;
    const order = habits.map(h => h.id);
    order.splice(idx, 1);
    order.splice(to, 0, id);
    const rank = new Map(order.map((hid, i) => [hid, i]));
    const updated = allHabits.map(h => (rank.has(h.id) ? { ...h, sortOrder: rank.get(h.id) } : h));
    setHabits(updated);
    if (userId) updated.filter(h => rank.has(h.id)).forEach(h => syncHabit(userId, h));
  }, [habits, allHabits, userId]);

  const getNote = useCallback((habitId, key) => (notes[key] || {})[habitId] || '', [notes]);

  // Mood 1-5 for a day; `null` clears it. Only today (or earlier) can be rated.
  const setMood = useCallback((key, value) => {
    if (key > todayStr()) return;
    const v = value >= 1 && value <= 5 ? value : null;
    setMoods(prev => { const next = { ...prev }; if (v) next[key] = v; else delete next[key]; return next; });
    if (userId) syncMood(userId, key, v);
  }, [todayStr, userId]);

  const setNote = useCallback((habitId, key, text) => {
    const trimmed = (text || '').trim();
    setNotes(prev => {
      const day = { ...(prev[key] || {}) };
      if (trimmed) day[habitId] = trimmed; else delete day[habitId];
      const out = { ...prev };
      if (Object.keys(day).length > 0) out[key] = day; else delete out[key];
      return out;
    });
    if (userId) syncNote(userId, key, habitId, trimmed, (completions[key] || {})[habitId] || 0);
  }, [userId, completions]);

  const deleteHabit = useCallback((id) => {
    const gone = allHabits.find(h => h.id === id);
    if (gone?.customIconUri || gone?.iconStoragePath) removeIcon(userId, id, gone.iconStoragePath);
    setHabits(prev => prev.filter(h => h.id !== id));
    const updatedChallenges = challenges.map(ch => ({
      ...ch,
      linkedHabitIds: (ch.linkedHabitIds || []).filter(hid => hid !== id),
    }));
    setChallenges(updatedChallenges);
    if (userId) {
      deleteHabitSync(userId, id);
      updatedChallenges.forEach(ch => syncChallenge(userId, ch));
    }
  }, [challenges, userId, allHabits]);

  const updateSettings = useCallback((updates) => {
    const next = { ...settings, ...updates };
    // Synchronous, so a toggle that just turned haptics on can be felt in the same tap.
    if ('hapticsEnabled' in updates || 'soundEnabled' in updates) applyFeedbackSettings(next);
    setSettings(next);
    if (userId) syncSettings(userId, next);
  }, [settings, userId]);

  // ── Streak forgiveness ───────────────────────────────────────────────────────

  const isHabitSkippedOn = useCallback((habitId, key) => {
    return !!(settings.skips?.[key] || []).includes(habitId);
  }, [settings.skips]);

  // Skip (or unskip) a habit for a day: the day becomes a rest day for that habit, so
  // the streak is preserved without counting it.
  const toggleSkipHabitOn = useCallback((habitId, key) => {
    const current = settings.skips?.[key] || [];
    const nextDay = current.includes(habitId) ? current.filter(id => id !== habitId) : [...current, habitId];
    const skips = { ...(settings.skips || {}) };
    if (nextDay.length > 0) skips[key] = nextDay; else delete skips[key];
    updateSettings({ skips });
  }, [settings.skips, updateSettings]);

  const isDayFrozen = useCallback((key) => (settings.streakFreezes || []).includes(key), [settings.streakFreezes]);

  // Skipped habit-days and frozen days both count as rest.
  const isExcused = useCallback((key, habitId) => {
    return isDayFrozen(key) || isHabitSkippedOn(habitId, key);
  }, [isDayFrozen, isHabitSkippedOn]);

  const freezesLeft = freezesLeftInMonth(settings.streakFreezes, todayStr());

  // ── Streak milestones ────────────────────────────────────────────────────────
  // The milestone just crossed, waiting for TodayScreen to celebrate it.
  const [pendingMilestone, setPendingMilestone] = useState(null);
  const clearPendingMilestone = useCallback(() => setPendingMilestone(null), []);

  // ── Challenge actions ────────────────────────────────────────────────────────

  // Functional updates so several challenges can be marked or un-marked in one tick
  // (Mark the rest done, its Undo) without the last call overwriting the others.
  const markChallengeDay = useCallback((challengeId) => {
    const today = todayStr();
    const mark = (ch) => {
      if (ch.completedDays.includes(today)) return ch;
      const newDays = [...ch.completedDays, today];
      return { ...ch, completedDays: newDays, completed: newDays.length >= ch.days };
    };
    setChallenges(prev => prev.map(ch => (ch.id === challengeId ? mark(ch) : ch)));
    const ch = challenges.find(c => c.id === challengeId);
    if (userId && ch) syncChallenge(userId, mark(ch));
  }, [challenges, todayStr, userId]);

  // `key` defaults to today; Mark the rest's Undo passes the day the action ran.
  const unmarkChallengeDay = useCallback((challengeId, key) => {
    const today = key || todayStr();
    const unmark = (ch) => ({ ...ch, completedDays: ch.completedDays.filter(d => d !== today), completed: false });
    setChallenges(prev => prev.map(ch => (ch.id === challengeId ? unmark(ch) : ch)));
    const ch = challenges.find(c => c.id === challengeId);
    if (userId && ch) syncChallenge(userId, unmark(ch));
  }, [challenges, todayStr, userId]);

  const editChallenge = useCallback((challengeId, updates) => {
    const updated = challenges.map(ch => ch.id === challengeId ? { ...ch, ...updates } : ch);
    setChallenges(updated);
    if (userId) {
      const ch = updated.find(c => c.id === challengeId);
      if (ch) syncChallenge(userId, ch);
    }
  }, [challenges, userId]);

  const createChallenge = useCallback((name, description, days, icon = '🏆', linkedHabitIds = []) => {
    if (challenges.length >= 3) return null;
    const newCh = {
      id: Date.now().toString(),
      name, description, days, icon,
      completedDays: [],
      completed: false,
      startDate: todayStr(),
      linkedHabitIds,
    };
    setChallenges(prev => [...prev, newCh]);
    if (userId) syncChallenge(userId, newCh);
    track(Events.CHALLENGE_CREATED, { days, linked: linkedHabitIds.length });
    return newCh.id;
  }, [challenges, todayStr, userId]);

  const deleteChallenge = useCallback((challengeId) => {
    const ch = challenges.find(c => c.id === challengeId);
    if (ch) {
      const tier = getChallengeTier(ch.completedDays.length, ch.days);
      const archived = { ...ch, archivedAt: todayStr(), tier };
      setPastChallenges(prev => [archived, ...prev]);
      if (userId) {
        deleteChallengeSync(userId, challengeId);
        syncPastChallenge(userId, archived);
      }
    }
    setChallenges(prev => prev.filter(c => c.id !== challengeId));
  }, [challenges, todayStr, userId]);

  // `key`: the day being claimed (defaults to today; a deferred Mark-the-rest
  // completion passes the day the action ran).
  const completeChallengeImmediately = useCallback((challengeId, key) => {
    const today = key || todayStr();
    const ch = challenges.find(c => c.id === challengeId);
    if (!ch) return;
    const updatedDays = ch.completedDays.includes(today)
      ? ch.completedDays
      : [...ch.completedDays, today];
    const tier = getChallengeTier(updatedDays.length, ch.days);
    const archived = { ...ch, completedDays: updatedDays, archivedAt: today, tier, completed: true };
    track(Events.CHALLENGE_COMPLETED, { tier });
    setPastChallenges(prev => {
      if (prev.some(pc => pc.id === ch.id)) return prev;
      return [archived, ...prev];
    });
    setChallenges(prev => prev.filter(c => c.id !== challengeId));
    if (userId) {
      deleteChallengeSync(userId, challengeId);
      syncPastChallenge(userId, archived);
    }
  }, [challenges, todayStr, userId]);

  // "Mark the rest done" (S-02): only untouched, non-skipped daily/quit habits become 1
  // (applyMarkRest). Returns { before, next, changedIds }; `before` is today's exact
  // map (undefined when the day had no entries) for restoreHabitCounts.
  const planMarkRest = useCallback(() => {
    const today = todayStr();
    const before = completions[today];
    const skipsToday = settings.skips?.[today] || [];
    const { next, changedIds } = applyMarkRest(before, dueHabits, skipsToday, isHabitSatisfied);
    return { before, next, changedIds };
  }, [completions, dueHabits, settings.skips, isHabitSatisfied, todayStr]);

  const markRestDone = useCallback(() => {
    const plan = planMarkRest();
    if (plan.changedIds.length === 0) return plan;
    const today = todayStr();
    setCompletions(prev => ({ ...prev, [today]: { ...(prev[today] || {}), ...Object.fromEntries(plan.changedIds.map(id => [id, 1])) } }));
    setDailySnapshot(prev => withSnapshot(prev, today, habits));
    if (userId) syncCompletionsForDate(userId, today, Object.fromEntries(plan.changedIds.map(id => [id, 1])));
    plan.changedIds.forEach(id => track(Events.COMPLETION, { type: habits.find(h => h.id === id)?.type }));
    return plan;
  }, [planMarkRest, habits, todayStr, userId]);

  // Undo for Mark the rest on day `key`: the habits it marked that are still at 1 go back
  // to `before` (revertMarkRest); anything edited inside the window is kept.
  const restoreHabitCounts = useCallback((before, changedIds, key) => {
    const day = key || todayStr();
    const { syncMap } = revertMarkRest(completions, day, before, changedIds);
    setCompletions(prev => revertMarkRest(prev, day, before, changedIds).completions);
    if (userId && Object.keys(syncMap).length > 0) syncCompletionsForDate(userId, day, syncMap);
  }, [completions, todayStr, userId]);

  const archiveExpiredChallenge = useCallback((challengeId) => {
    const ch = challenges.find(c => c.id === challengeId);
    if (!ch) return;
    const tier = getChallengeTier(ch.completedDays.length, ch.days);
    const archived = { ...ch, archivedAt: todayStr(), tier, completed: tier !== 'none' };
    setPendingChallengeRewards(prev => {
      if (prev.some(r => r.id === ch.id)) return prev;
      return [...prev, archived];
    });
    setPastChallenges(prev => {
      if (prev.some(pc => pc.id === ch.id)) return prev;
      return [archived, ...prev];
    });
    setChallenges(prev => prev.filter(c => c.id !== challengeId));
    if (userId) {
      deleteChallengeSync(userId, challengeId);
      syncPastChallenge(userId, archived);
    }
  }, [challenges, todayStr, userId]);

  // Archive challenges whose window has elapsed. Runs after load, whenever the date
  // changes (foreground / midnight / dev offset) and whenever challenges change, so it
  // no longer depends on ChallengeScreen being mounted.
  useEffect(() => {
    if (!loaded) return;
    const today = todayStr();
    challenges.forEach(ch => {
      if (isChallengeExpired(ch, today)) archiveExpiredChallenge(ch.id);
    });
  }, [loaded, challenges, todayStr, archiveExpiredChallenge]);

  const clearPendingChallengeRewards = useCallback(() => {
    setPendingChallengeRewards([]);
  }, []);

  const linkHabitToChallenge = useCallback((challengeId, habitId) => {
    const updated = challenges.map(ch => {
      if (ch.id !== challengeId) return ch;
      const ids = ch.linkedHabitIds || [];
      if (ids.includes(habitId)) return ch;
      return { ...ch, linkedHabitIds: [...ids, habitId] };
    });
    setChallenges(updated);
    if (userId) {
      const ch = updated.find(c => c.id === challengeId);
      if (ch) syncChallenge(userId, ch);
    }
  }, [challenges, userId]);

  const unlinkHabitFromChallenge = useCallback((challengeId, habitId) => {
    const updated = challenges.map(ch => {
      if (ch.id !== challengeId) return ch;
      return { ...ch, linkedHabitIds: (ch.linkedHabitIds || []).filter(id => id !== habitId) };
    });
    setChallenges(updated);
    if (userId) {
      const ch = updated.find(c => c.id === challengeId);
      if (ch) syncChallenge(userId, ch);
    }
  }, [challenges, userId]);

  const linkAllHabitsToChallenge = useCallback((challengeId) => {
    const updated = challenges.map(ch => {
      if (ch.id !== challengeId) return ch;
      return { ...ch, linkedHabitIds: habits.map(h => h.id) };
    });
    setChallenges(updated);
    if (userId) {
      const ch = updated.find(c => c.id === challengeId);
      if (ch) syncChallenge(userId, ch);
    }
  }, [challenges, habits, userId]);

  // ── Developer mode ───────────────────────────────────────────────────────────

  const setDevMode = useCallback((enabled) => {
    setDevModeState(enabled);
    if (!enabled) setDateOffset(0);
    saveDevMode(enabled);
  }, []);

  // ── Onboarding / reset ───────────────────────────────────────────────────────

  // `starterHabits` (optional) are created in order with the onboarding plan the user
  // chose. The 3-Day Kickstart is only created on a true first run: a returning user
  // restored from the cloud already has history.
  const completeOnboarding = useCallback((starterHabits = []) => {
    setHasOnboarded(true);
    const today = todayStr();
    if (starterHabits.length > 0 && habits.length === 0) {
      const base = Date.now();
      const created = starterHabits.map((h, i) => ({
        ...h,
        id: String(base + i),
        createdAt: today,
        schedule: normalizeSchedule(h.schedule),
        sortOrder: i,
      }));
      setHabits(prev => [...prev, ...created]);
      if (userId) created.forEach(h => syncHabit(userId, h));
    }
    track(Events.ONBOARDING_COMPLETED, { starters: starterHabits.length });
    if (challenges.length === 0 && pastChallenges.length === 0) {
      const starter = makeStarterChallenge(today);
      setChallenges([starter]);
      if (userId) syncChallenge(userId, starter);
    }
  }, [challenges.length, pastChallenges.length, habits.length, todayStr, userId]);
  completeOnboardingRef.current = completeOnboarding;

  const resetAll = useCallback(async () => {
    const today = localDateKey();
    await storeClearAll();
    if (userId) await deleteAllUserData(userId).catch(e => console.warn('deleteAllUserData:', e));
    saveData('lastUserId', userId);
    setHabits([]);
    setCompletions({});
    setNotes({});
    setMoods({});
    setSettings(DEFAULT_SETTINGS);
    setChallenges([]);
    setPastChallenges([]);
    setDailySnapshot({});
    setHasOnboarded(false);
    setDateOffset(0);
    setAccountCreatedAt(today);
  }, [userId]);

  const markBackedUp = useCallback(() => {
    const now = new Date().toISOString();
    setLastBackupAt(now);
    saveData('lastBackupAt', now);
    track(Events.BACKUP_EXPORTED);
  }, []);

  // Apply a validated backup ('replace' wipes current data first; 'merge' layers it
  // over). Everything is persisted locally through the normal effects and pushed to
  // the cloud in one go.
  const importBackup = useCallback(async (data, mode = 'merge') => {
    const current = { habits: allHabits, completions, notes, moods, settings, challenges, pastChallenges, dailySnapshot, accountCreatedAt };
    const next = mode === 'replace'
      ? { ...data, settings: data.settings ? migrateSettings(data.settings) : settings }
      : mergeBackup(current, data);
    const nextHabits = migrateHabits(next.habits, next.completions || {});
    const nextSettings = migrateSettings(next.settings);
    const nextChallenges = migrateChallenges(next.challenges);
    setHabits(nextHabits);
    setCompletions(next.completions);
    setNotes(next.notes);
    setMoods(next.moods || {});
    applyFeedbackSettings(nextSettings);
    setSettings(nextSettings);
    setChallenges(nextChallenges);
    setPastChallenges(next.pastChallenges);
    setDailySnapshot(next.dailySnapshot);
    // Replace keeps the backup's own date (so it can move later); merge already took
    // the earlier of the two. Either way the imported history can lower it.
    const nextAca = deriveAccountCreatedAt({ stored: next.accountCreatedAt ?? null, completions: next.completions, habits: nextHabits });
    setAccountCreatedAt(nextAca);
    saveData('accountCreatedAt', nextAca);
    setHasOnboarded(true);
    stateRef.current = { habits: nextHabits, completions: next.completions, notes: next.notes, moods: next.moods || {}, settings: nextSettings, challenges: nextChallenges, pastChallenges: next.pastChallenges, dailySnapshot: next.dailySnapshot };
    if (userId) {
      if (mode === 'replace') await deleteAllUserData(userId).catch(() => {});
      await pushAllLocalData(userId, stateRef.current);
    }
    track(Events.BACKUP_RESTORED, { mode });
  }, [allHabits, completions, notes, moods, settings, challenges, pastChallenges, dailySnapshot, accountCreatedAt, userId]);

  // Flush all current state to Supabase — call before sign-out to avoid data loss
  const pushAllData = useCallback(async () => {
    if (!userId) return;
    await pushAllLocalData(userId, stateRef.current);
  }, [userId]);

  // Dev tool: fill the last 30 days with random completion data
  // The demo effect calls this in the same commit in which the snapshot effect queues
  // today's snapshot, so `completions` / `dailySnapshot` in this closure can be stale
  // (the old seed copied a stale `today: []` over the fresh one, STA-2). State is
  // therefore applied with functional updates, and today's snapshot is never replaced
  // by an empty one. The seeded habits are backdated so their history counts.
  // `deterministic` (mockup demo) uses a fixed-seed PRNG; the dev tool keeps Math.random.
  const seedRandomHistory = useCallback(async ({ deterministic = false } = {}) => {
    const realToday = localDateKey();
    const rand = deterministic ? seededRandom(DEMO_SEED) : Math.random;
    const seed = buildSeed(habits, completions, dailySnapshot, realToday, rand);
    const seededIds = new Set(habits.map(h => h.id));
    const backdate = (h) => (seededIds.has(h.id) ? backdateCreatedAt(h, seed.floor) : h);
    const nextAllHabits = allHabits.map(backdate);

    // Ensure accountCreatedAt is at least 31 days back so history is visible
    const newAca = !accountCreatedAt || accountCreatedAt > seed.floor ? seed.floor : accountCreatedAt;

    setCompletions(prev => applySeedCompletions(prev, seed.pastCompletions));
    setDailySnapshot(prev => applySeedSnapshot(prev, seed.pastSnapshot, realToday, habits));
    setHabits(prev => prev.map(backdate));
    // Save immediately to AsyncStorage so data persists even if the app is killed before
    // React's state-change effects fire, or if a subsequent Supabase pull would overwrite them.
    // `seed.*` already merges the closure state the same way the updaters merge `prev`.
    await saveData('completions', seed.completions);
    await saveData('dailySnapshot', seed.snapshot);
    await saveData('habits', nextAllHabits);
    if (newAca !== accountCreatedAt) {
      setAccountCreatedAt(newAca);
      saveData('accountCreatedAt', newAca);
    }
    if (userId) {
      await pushAllLocalData(userId, { ...stateRef.current, habits: nextAllHabits, completions: seed.completions, dailySnapshot: seed.snapshot });
    }
  }, [habits, allHabits, completions, dailySnapshot, accountCreatedAt, userId]);
  seedRandomHistoryRef.current = seedRandomHistory;

  // ── Streak / progress helpers ────────────────────────────────────────────────

  // Habits on a given day (utils/dayStatus.js): today is always the live list, past
  // days their snapshot (falling back to the live list), with createdAt filled in
  // from the live records. This is the one source for streaks, Perfect Days, the
  // heat map and the share cards.
  // The streak walk's view (`habitsOnDay`) leaves out a habit that did not exist yet
  // on a day other habits existed on (see streakHabitsOn).
  const dayRules = useMemo(
    () => makeDayRules({ today: todayKey(dateOffset), snapshot: dailySnapshot, liveHabits: habits, allHabits, completions, accountCreatedAt }),
    [dailySnapshot, habits, allHabits, completions, dateOffset, clockTick, accountCreatedAt], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const habitsOnDay = dayRules.habitsOn;
  const isSnapshotHabitDone = dayRules.isDone;

  const getStreakForHabit = useCallback((habitId) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return 0;
    const today = todayKey(dateOffset);
    return habitStreak(habit.schedule, today, today, (k) => isHabitDoneOn(habit, k), { isExcused: (k) => isExcused(k, habitId) });
  }, [habits, dateOffset, isHabitDoneOn, isExcused]);

  const getOverallStreak = useCallback(() => {
    const today = todayKey(dateOffset);
    return overallStreak(today, today, habitsOnDay, isSnapshotHabitDone, { isExcused });
  }, [habitsOnDay, isSnapshotHabitDone, isExcused, dateOffset]);

  const getBestStreak = useCallback(() => {
    const today = todayKey(dateOffset);
    const from = accountCreatedAt && accountCreatedAt <= today ? accountCreatedAt : today;
    return Math.max(bestOverallStreak(from, today, today, habitsOnDay, isSnapshotHabitDone, isExcused), getOverallStreak());
  }, [habitsOnDay, isSnapshotHabitDone, isExcused, dateOffset, accountCreatedAt, getOverallStreak]);

  // Record newly crossed streak milestones (7/30/100/365). Runs after any change to
  // the data; the first new one found is queued for a celebration.
  useEffect(() => {
    if (!loaded) return;
    const streak = getOverallStreak();
    const have = new Set((settings.milestones || []).map(m => m.id));
    const earned = STREAK_MILESTONES.filter(m => streak >= m.days && !have.has(`streak-${m.days}`));
    if (earned.length === 0) return;
    const today = todayStr();
    const added = earned.map(m => ({ id: `streak-${m.days}`, days: m.days, date: today }));
    updateSettings({ milestones: [...(settings.milestones || []), ...added] });
    setPendingMilestone(earned[earned.length - 1]);
    track(Events.MILESTONE, { days: earned[earned.length - 1].days });
  }, [loaded, getOverallStreak, settings.milestones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto streak freezes: once the data is loaded and whenever the date or history
  // changes, cover up to two missed days per month in the last week. A frozen day
  // that is later filled in (edit yesterday) releases its freeze. Uses the real
  // date, not the dev offset, so simulated days never burn real freezes.
  useEffect(() => {
    if (!loaded) return;
    const today = localDateKey();
    const raw = (k) => overallDayStatus(k, today, habitsOnDay, isSnapshotHabitDone, (key, id) => isHabitSkippedOn(id, key));
    // Never spend a freeze on a day before any habit existed (or before the account).
    const floor = [accountCreatedAt, earliestCreatedAt(allHabits)].filter(Boolean).sort().pop();
    const next = reconcileFreezes(settings.streakFreezes, today, raw, { floor: floor || undefined });
    if (next !== settings.streakFreezes) updateSettings({ streakFreezes: next });
  }, [loaded, clockTick, completions, dailySnapshot, habits, allHabits, settings.skips, settings.streakFreezes, accountCreatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // One day for Perfect Days, the heat map, the bar chart and the share cards, judged
  // by the shared rule (utils/dayStatus.js summarizeDay). Rest days and habits that
  // did not exist yet drop out of the totals; `before` marks a day on which no habit
  // existed yet (not drawn, never counted). The habit list leaves 'before' habits out.
  const getDaySummary = useCallback((dateStr) => {
    const s = dayRules.summary(dateStr, isExcused);
    return {
      date: dateStr,
      completed: s.completed,
      total: s.total,
      before: s.before,
      habits: s.habits.filter(h => h.status !== 'before').map(h => ({ ...h, skipped: isHabitSkippedOn(h.id, dateStr) })),
      frozen: isDayFrozen(dateStr),
    };
  }, [dayRules, isExcused, isHabitSkippedOn, isDayFrozen]);

  const getLastNDays = useCallback((n) => {
    const days = [];

    const todayLocal = todayKey(dateOffset);

    // Window starts at today-(n-1), but no earlier than account creation
    let windowStart = addDays(todayLocal, -(n - 1));
    if (accountCreatedAt && accountCreatedAt > windowStart) {
      windowStart = accountCreatedAt;
    }

    for (let i = 0; i < n; i++) {
      const dateStr = addDays(windowStart, i);

      if (dateStr > todayLocal) {
        days.push({ date: dateStr, completed: 0, total: 0, habits: [], future: true });
      } else {
        days.push(getDaySummary(dateStr));
      }
    }
    return days;
  }, [getDaySummary, dateOffset, accountCreatedAt]);

  const getLast30Days = useCallback(() => getLastNDays(30), [getLastNDays]);

  // 'system' follows the OS appearance; 'light' / 'dark' are explicit overrides.
  const systemScheme = useColorScheme();
  const themeName = mockupTheme || (settings.theme === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : (settings.theme === 'dark' ? 'dark' : 'light'));
  const theme = themes[themeName];
  // The ui primitives read this small memoized context instead of the whole AppContext.
  const themeValue = useMemo(() => ({ theme, themeName }), [theme, themeName]);
  useEffect(() => {
    if (mockupParams.active && loaded) postToMockupHost({ type: 'mockup:ready' });
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AppContext.Provider value={{
      habits, allHabits, archivedHabits, completions, notes, moods, setMood, dailySnapshot, settings, challenges, pastChallenges, hasOnboarded, theme, themeName,
      effectiveChallenges, effectivePastChallenges,
      dateOffset, setDateOffset, accountCreatedAt, displayName,
      devMode, setDevMode,
      loaded,
      pendingChallengeRewards, clearPendingChallengeRewards,
      modalOpen, setModalOpen,
      requestedTab, setRequestedTab,
      pendingRoute, clearPendingRoute,
      pendingHabitLinkChallenge, setPendingHabitLinkChallenge,
      getTodayCompletions, getHabitCount, isHabitDone, isHabitDoneOn, isHabitSatisfied, dueHabits,
      getCompletedCount, isAllDone, isChallengeHabitsDone,
      incrementHabit, decrementHabit, setHabitCountOn, toggleHabitDoneOn,
      isHabitSkippedOn, toggleSkipHabitOn, isDayFrozen, isExcused, freezesLeft,
      pendingMilestone, clearPendingMilestone,
      addHabit, updateHabit, deleteHabit, archiveHabit, unarchiveHabit, moveHabit,
      getNote, setNote,
      updateSettings,
      markChallengeDay, unmarkChallengeDay, editChallenge, createChallenge, deleteChallenge,
      archiveExpiredChallenge, completeChallengeImmediately,
      markRestDone, planMarkRest, restoreHabitCounts, isHabitSatisfiedWith,
      linkHabitToChallenge, unlinkHabitFromChallenge, linkAllHabitsToChallenge,
      completeOnboarding, resetAll, pushAllData, seedRandomHistory,
      lastBackupAt, markBackedUp, importBackup,
      ensureNotificationPermission, notificationPermission, refreshNotificationPermission, notificationPrimer: { visible: primerVisible, answer: answerPrimer },
      isPro, refreshPro, paywall, openPaywall, closePaywall, canAddHabit, canAddReminder,
      getStreakForHabit, getOverallStreak, getBestStreak, getLast30Days, getLastNDays, getDaySummary,
      habitsOnDay, isSnapshotHabitDone,
      todayStr,
    }}>
      <ThemeContext.Provider value={themeValue}>
        {children}
      </ThemeContext.Provider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
