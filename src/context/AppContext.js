import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState } from 'react-native';
import { loadData, saveData, clearAll as storeClearAll } from '../utils/storage';
import { themes } from '../theme/colors';
import { useAuth } from './AuthContext';
import {
  pullAllData, pushAllLocalData, deleteAllUserData,
  syncHabit, deleteHabitSync,
  syncCompletion, syncCompletionsForDate,
  syncChallenge, deleteChallengeSync, syncPastChallenge,
  syncSettings,
} from '../services/sync';
import { scheduleEveningHabitReminder, cancelEveningHabitReminder } from '../utils/notifications';
import { localDateKey, todayKey, addDays } from '../utils/dates';
import { countBackStreak } from '../utils/streaks';
import { loadDevMode, saveDevMode } from '../utils/devMode';
import { isChallengeExpired } from '../utils/challenges';

const AppContext = createContext(null);

const DEFAULT_HABITS = [
  { id: '1', name: 'Drink 8 glasses of water', icon: '💧', type: 'volume', volumeGoal: 8, createdAt: '2025-01-01' },
  { id: '2', name: 'Exercise for 30 minutes', icon: '🏃', type: 'daily', volumeGoal: 1, createdAt: '2025-01-01' },
  { id: '3', name: 'Read for 20 minutes', icon: '📚', type: 'daily', volumeGoal: 1, createdAt: '2025-01-01' },
  { id: '4', name: 'Meditate', icon: '🧘', type: 'daily', volumeGoal: 1, createdAt: '2025-01-01' },
];

const DEFAULT_REMINDERS = [
  { id: 'morning', label: 'Morning Reminder', time: { hour12: 8, minute: 0, ampm: 'AM' }, enabled: true },
  { id: 'evening', label: 'Evening Reminder', time: { hour12: 8, minute: 0, ampm: 'PM' }, enabled: true },
];

const DEFAULT_SETTINGS = {
  notificationsEnabled: true,
  reminders: DEFAULT_REMINDERS,
  soundEnabled: true,
  hapticsEnabled: true,
  theme: 'light',
  eveningReminderEnabled: false,
  eveningReminderHour: 20,
  eveningReminderMinute: 0,
};

const STARTER_CHALLENGE = {
  id: 'starter',
  name: '3-Day Kickstart',
  description: 'Complete all your habits for 3 days in a row to build your foundation.',
  days: 3,
  completedDays: [],
  completed: false,
  startDate: localDateKey(),
  linkedHabitIds: ['1', '2', '3', '4'],
};

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

function migrateSettings(s) {
  if (!s) return DEFAULT_SETTINGS;
  if (s.reminders && Array.isArray(s.reminders)) {
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      reminders: s.reminders.map(r => ({
        ...r,
        time: r.time || { hour12: 8, minute: 0, ampm: 'AM' },
        enabled: r.enabled !== false,
      })),
    };
  }
  const migrateTime = (t, fallback) => {
    if (!t) return fallback;
    if (typeof t === 'object' && t.hour12 !== undefined) return t;
    const parts = String(t).split(':');
    const h = parseInt(parts[0]) || 8;
    const m = parseInt(parts[1]) || 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { hour12, minute: m, ampm };
  };
  return {
    ...DEFAULT_SETTINGS,
    notificationsEnabled: s.notificationsEnabled ?? true,
    soundEnabled: s.soundEnabled ?? true,
    hapticsEnabled: s.hapticsEnabled ?? true,
    theme: s.theme ?? 'light',
    eveningReminderEnabled: s.eveningReminderEnabled ?? false,
    eveningReminderHour: s.eveningReminderHour ?? 20,
    eveningReminderMinute: s.eveningReminderMinute ?? 0,
    reminders: [
      { id: 'morning', label: 'Morning Reminder', time: migrateTime(s.morningTime, { hour12: 8, minute: 0, ampm: 'AM' }), enabled: true },
      { id: 'evening', label: 'Evening Reminder', time: migrateTime(s.eveningTime, { hour12: 8, minute: 0, ampm: 'PM' }), enabled: true },
    ],
  };
}

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
  const [habits, setHabits] = useState([]);
  const [completions, setCompletions] = useState({});
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
  // Developer mode: unlocked per device from Settings (tap the version label). Gates the
  // dev tools section and makes the AI coach follow the simulated date offset.
  const [devMode, setDevModeState] = useState(false);

  const { user, displayName } = useAuth();
  const userId = user?.id ?? null;
  // Holds latest state snapshot for first-login cloud migration without re-triggering sync effect
  const stateRef = useRef({});

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

  useEffect(() => { loadPersistedData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPersistedData() {
    // NOTE: userId is always null here (auth resolves asynchronously after mount).
    // Do NOT check lastUserId vs userId here — it will always look like a different user.
    // The user-switch check runs in the cloud sync effect below, where userId is known.
    const [h, c, s, ch, ob, ds, pc, aca, savedOffset, pcr, dev] = await Promise.all([
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
    ]);

    if (h) setHabits(h);
    if (c) setCompletions(c);
    setSettings(migrateSettings(s));
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
      const today = localDateKey();
      const completionDates = c ? Object.keys(c).sort() : [];
      const firstDate = completionDates.length > 0 ? completionDates[0] : today;
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
  useEffect(() => { if (loaded) saveData('habits', habits); }, [habits, loaded]);
  useEffect(() => { if (loaded) saveData('completions', completions); }, [completions, loaded]);
  useEffect(() => { if (loaded) saveData('settings', settings); }, [settings, loaded]);
  useEffect(() => { if (loaded) saveData('dateOffset', dateOffset); }, [dateOffset, loaded]);
  useEffect(() => { if (loaded) saveData('challenges', challenges); }, [challenges, loaded]);
  useEffect(() => { if (loaded) saveData('hasOnboarded', hasOnboarded); }, [hasOnboarded, loaded]);
  useEffect(() => { if (loaded) saveData('dailySnapshot', dailySnapshot); }, [dailySnapshot, loaded]);
  useEffect(() => { if (loaded) saveData('pastChallenges', pastChallenges); }, [pastChallenges, loaded]);
  useEffect(() => { if (loaded && accountCreatedAt) saveData('accountCreatedAt', accountCreatedAt); }, [accountCreatedAt, loaded]);
  useEffect(() => { if (loaded) saveData('pendingChallengeRewards', pendingChallengeRewards); }, [pendingChallengeRewards, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const today = todayStr();
    setDailySnapshot(prev => ({
      ...prev,
      [today]: habits.map(h => ({ id: h.id, name: h.name, icon: h.icon, volumeGoal: h.volumeGoal })),
    }));
  }, [habits, loaded, todayStr]);

  // Keep stateRef fresh so the cloud sync effect can access current state without
  // adding all these values to its dependency array (which would re-trigger on every mutation)
  useEffect(() => {
    stateRef.current = { habits, completions, settings, challenges, pastChallenges, dailySnapshot };
  }, [habits, completions, settings, challenges, pastChallenges, dailySnapshot]);

  // ── Evening reminder scheduling ──────────────────────────────────────────────
  // Reschedule (or cancel) the evening habit reminder whenever completions or
  // relevant settings change. Uses real today — not the dev date offset — so the
  // notification fires at the right wall-clock time.
  useEffect(() => {
    if (!loaded) return;
    const realToday = localDateKey();
    if (!settings.eveningReminderEnabled || !settings.notificationsEnabled) {
      cancelEveningHabitReminder(realToday);
      return;
    }
    const todayCompletions = completions[realToday] || {};
    const allDone = habits.length > 0 && habits.every(h => (todayCompletions[h.id] || 0) >= h.volumeGoal);
    if (allDone) {
      cancelEveningHabitReminder(realToday);
    } else {
      scheduleEveningHabitReminder(realToday, settings.eveningReminderHour ?? 20, settings.eveningReminderMinute ?? 0);
    }
  }, [completions, habits, settings.eveningReminderEnabled, settings.notificationsEnabled, settings.eveningReminderHour, settings.eveningReminderMinute, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const emptyState = { habits: [], completions: {}, settings: DEFAULT_SETTINGS, challenges: [], pastChallenges: [], dailySnapshot: {} };

        if (accountWasDeleted) {
          // Account was explicitly deleted — the previous user's storage was already wiped in
          // AuthContext.deleteAccount(). Just clear the sentinel and reset in-memory state.
          await saveData('accountWasDeleted', null);
          stateRef.current = emptyState;
          setHabits([]);
          setCompletions({});
          setChallenges([]);
          setPastChallenges([]);
          setDailySnapshot({});
        } else if (lastUserId !== null && lastUserId !== userId) {
          // Different user logged in on this device — wipe the previous user's local data.
          await storeClearAll();
          stateRef.current = emptyState;
          setHabits([]);
          setCompletions({});
          setChallenges([]);
          setPastChallenges([]);
          setDailySnapshot({});
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
          return;
        }

        const hasCloudData = cloudData.habits !== null && cloudData.habits.length > 0;
        if (hasCloudData) {
          setHabits(cloudData.habits);
          if (cloudData.completions) setCompletions(cloudData.completions);
          if (cloudData.settings) setSettings(migrateSettings(cloudData.settings));
          if (cloudData.challenges) setChallenges(migrateChallenges(cloudData.challenges));
          if (cloudData.pastChallenges) setPastChallenges(cloudData.pastChallenges);
          if (cloudData.dailySnapshot) setDailySnapshot(cloudData.dailySnapshot);
          setHasOnboarded(true);
        } else {
          await pushAllLocalData(userId, stateRef.current);
        }
      } catch (e) {
        if (__DEV__) console.warn('Cloud sync error:', e.message);
      }
    };
    sync();
  }, [userId, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Completion helpers ───────────────────────────────────────────────────────

  const getTodayCompletions = useCallback(() => completions[todayStr()] || {}, [completions, todayStr]);

  const getHabitCount = useCallback((habitId) => {
    const today = completions[todayStr()] || {};
    return today[habitId] || 0;
  }, [completions, todayStr]);

  const isHabitDone = useCallback((habit) => {
    return getHabitCount(habit.id) >= habit.volumeGoal;
  }, [getHabitCount]);

  const getCompletedCount = useCallback(() => {
    return habits.filter(h => isHabitDone(h)).length;
  }, [habits, isHabitDone]);

  const isAllDone = useCallback(() => {
    return habits.length > 0 && habits.every(h => isHabitDone(h));
  }, [habits, isHabitDone]);

  const isChallengeHabitsDone = useCallback((challenge) => {
    const ids = challenge.linkedHabitIds || [];
    const relevant = ids.length > 0 ? habits.filter(h => ids.includes(h.id)) : habits;
    return relevant.length > 0 && relevant.every(h => isHabitDone(h));
  }, [habits, isHabitDone]);

  // ── Habit mutations ──────────────────────────────────────────────────────────

  const incrementHabit = useCallback((habitId) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return false;
    const today = todayStr();
    const current = (completions[today] || {})[habitId] || 0;
    if (current >= habit.volumeGoal) return false;
    const next = current + 1;
    setCompletions(prev => ({
      ...prev,
      [today]: { ...(prev[today] || {}), [habitId]: next },
    }));
    setDailySnapshot(prev => {
      if (prev[today]) return prev;
      return {
        ...prev,
        [today]: habits.map(h => ({ id: h.id, name: h.name, icon: h.icon, volumeGoal: h.volumeGoal })),
      };
    });
    if (userId) syncCompletion(userId, today, habitId, next);
    return next >= habit.volumeGoal;
  }, [completions, habits, todayStr, userId]);

  const decrementHabit = useCallback((habitId) => {
    const today = todayStr();
    const current = (completions[today] || {})[habitId] || 0;
    if (current <= 0) return;
    setCompletions(prev => ({
      ...prev,
      [today]: { ...(prev[today] || {}), [habitId]: current - 1 },
    }));
    if (userId) syncCompletion(userId, today, habitId, current - 1);
  }, [completions, todayStr, userId]);

  const addHabit = useCallback((habit) => {
    const newHabit = { ...habit, id: Date.now().toString(), createdAt: todayStr() };
    setHabits(prev => [...prev, newHabit]);
    if (userId) syncHabit(userId, newHabit);
    return newHabit.id;
  }, [todayStr, userId]);

  const updateHabit = useCallback((id, updates) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...updates } : h));
    if (userId) {
      const habit = habits.find(h => h.id === id);
      if (habit) syncHabit(userId, { ...habit, ...updates });
    }
  }, [habits, userId]);

  const deleteHabit = useCallback((id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    const updatedChallenges = challenges.map(ch => ({
      ...ch,
      linkedHabitIds: (ch.linkedHabitIds || []).filter(hid => hid !== id),
    }));
    setChallenges(updatedChallenges);
    const updatedSettings = { ...settings, reminders: settings.reminders.filter(r => r.id !== `habit-${id}`) };
    setSettings(updatedSettings);
    if (userId) {
      deleteHabitSync(userId, id);
      updatedChallenges.forEach(ch => syncChallenge(userId, ch));
      syncSettings(userId, updatedSettings);
    }
  }, [challenges, settings, userId]);

  const updateSettings = useCallback((updates) => {
    const next = { ...settings, ...updates };
    setSettings(next);
    if (userId) syncSettings(userId, next);
  }, [settings, userId]);

  // ── Challenge actions ────────────────────────────────────────────────────────

  const markChallengeDay = useCallback((challengeId) => {
    const today = todayStr();
    const updated = challenges.map(ch => {
      if (ch.id !== challengeId) return ch;
      if (ch.completedDays.includes(today)) return ch;
      const newDays = [...ch.completedDays, today];
      return { ...ch, completedDays: newDays, completed: newDays.length >= ch.days };
    });
    setChallenges(updated);
    if (userId) {
      const ch = updated.find(c => c.id === challengeId);
      if (ch) syncChallenge(userId, ch);
    }
  }, [challenges, todayStr, userId]);

  const unmarkChallengeDay = useCallback((challengeId) => {
    const today = todayStr();
    const updated = challenges.map(ch => {
      if (ch.id !== challengeId) return ch;
      return { ...ch, completedDays: ch.completedDays.filter(d => d !== today), completed: false };
    });
    setChallenges(updated);
    if (userId) {
      const ch = updated.find(c => c.id === challengeId);
      if (ch) syncChallenge(userId, ch);
    }
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

  const completeChallengeImmediately = useCallback((challengeId) => {
    const today = todayStr();
    const ch = challenges.find(c => c.id === challengeId);
    if (!ch) return;
    const updatedDays = ch.completedDays.includes(today)
      ? ch.completedDays
      : [...ch.completedDays, today];
    const tier = getChallengeTier(updatedDays.length, ch.days);
    const archived = { ...ch, completedDays: updatedDays, archivedAt: today, tier, completed: true };
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

  const setAllHabitCounts = useCallback((getValue) => {
    const today = todayStr();
    const todayMap = {};
    habits.forEach(h => { todayMap[h.id] = getValue(h); });
    setCompletions(prev => ({ ...prev, [today]: todayMap }));
    if (userId) syncCompletionsForDate(userId, today, todayMap);
  }, [habits, todayStr, userId]);

  const selectAllHabitsToday = useCallback(() => setAllHabitCounts(h => h.volumeGoal), [setAllHabitCounts]);
  const resetAllHabitsToday = useCallback(() => setAllHabitCounts(() => 0), [setAllHabitCounts]);

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

  const completeOnboarding = useCallback(() => setHasOnboarded(true), []);

  const resetAll = useCallback(async () => {
    const today = localDateKey();
    await storeClearAll();
    if (userId) await deleteAllUserData(userId).catch(e => console.warn('deleteAllUserData:', e));
    saveData('lastUserId', userId);
    setHabits([]);
    setCompletions({});
    setSettings(DEFAULT_SETTINGS);
    setChallenges([]);
    setPastChallenges([]);
    setDailySnapshot({});
    setHasOnboarded(false);
    setDateOffset(0);
    setAccountCreatedAt(today);
  }, [userId]);

  // Flush all current state to Supabase — call before sign-out to avoid data loss
  const pushAllData = useCallback(async () => {
    if (!userId) return;
    await pushAllLocalData(userId, stateRef.current);
  }, [userId]);

  // Dev tool: fill the last 30 days with random completion data
  const seedRandomHistory = useCallback(async () => {
    const habitSnapshot = habits.map(h => ({ id: h.id, name: h.name, icon: h.icon, volumeGoal: h.volumeGoal }));
    const newCompletions = { ...completions };
    const newSnapshot = { ...dailySnapshot };

    const realToday = localDateKey();
    for (let i = 1; i <= 30; i++) {
      const dateStr = addDays(realToday, -i);
      const dayMap = {};
      habits.forEach(h => {
        // Each habit independently gets a 55–95% daily completion rate
        const rate = 0.55 + Math.random() * 0.4;
        dayMap[h.id] = Math.random() < rate ? h.volumeGoal : 0;
      });
      newCompletions[dateStr] = dayMap;
      newSnapshot[dateStr] = habitSnapshot;
    }

    // Ensure accountCreatedAt is at least 31 days back so history is visible
    const floorDate = addDays(realToday, -31);
    const newAca = !accountCreatedAt || accountCreatedAt > floorDate ? floorDate : accountCreatedAt;

    setCompletions(newCompletions);
    setDailySnapshot(newSnapshot);
    // Save immediately to AsyncStorage so data persists even if the app is killed before
    // React's state-change effects fire, or if a subsequent Supabase pull would overwrite them.
    await saveData('completions', newCompletions);
    await saveData('dailySnapshot', newSnapshot);
    if (newAca !== accountCreatedAt) {
      setAccountCreatedAt(newAca);
      saveData('accountCreatedAt', newAca);
    }
    if (userId) {
      await pushAllLocalData(userId, { ...stateRef.current, completions: newCompletions, dailySnapshot: newSnapshot });
    }
  }, [habits, completions, dailySnapshot, accountCreatedAt, userId]);

  // ── Streak / progress helpers ────────────────────────────────────────────────

  const getStreakForHabit = useCallback((habitId) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return 0;
    return countBackStreak(todayKey(dateOffset), (dateStr) => {
      return ((completions[dateStr] || {})[habitId] || 0) >= habit.volumeGoal;
    });
  }, [completions, habits, dateOffset]);

  const getOverallStreak = useCallback(() => {
    return countBackStreak(todayKey(dateOffset), (dateStr) => {
      const dayCompletions = completions[dateStr] || {};
      const dayHabits = dailySnapshot[dateStr] || habits;
      return dayHabits.length > 0 && dayHabits.every(h => (dayCompletions[h.id] || 0) >= h.volumeGoal);
    });
  }, [completions, habits, dailySnapshot, dateOffset]);

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
        const dayCompletions = completions[dateStr] || {};
        const snapshot = dailySnapshot[dateStr];
        const dayHabits = snapshot || habits.map(h => ({ id: h.id, name: h.name, icon: h.icon, volumeGoal: h.volumeGoal }));
        const done = dayHabits.filter(h => (dayCompletions[h.id] || 0) >= h.volumeGoal).length;
        days.push({ date: dateStr, completed: done, total: dayHabits.length, habits: dayHabits });
      }
    }
    return days;
  }, [completions, habits, dailySnapshot, dateOffset, accountCreatedAt]);

  const getLast30Days = useCallback(() => getLastNDays(30), [getLastNDays]);

  const theme = themes[settings.theme] || themes.light;

  if (!loaded) return null;

  return (
    <AppContext.Provider value={{
      habits, completions, settings, challenges, pastChallenges, hasOnboarded, theme,
      effectiveChallenges, effectivePastChallenges,
      dateOffset, setDateOffset, accountCreatedAt, displayName,
      devMode, setDevMode,
      loaded,
      pendingChallengeRewards, clearPendingChallengeRewards,
      modalOpen, setModalOpen,
      requestedTab, setRequestedTab,
      pendingHabitLinkChallenge, setPendingHabitLinkChallenge,
      getTodayCompletions, getHabitCount, isHabitDone, getCompletedCount, isAllDone,
      isChallengeHabitsDone,
      incrementHabit, decrementHabit,
      addHabit, updateHabit, deleteHabit,
      updateSettings,
      markChallengeDay, unmarkChallengeDay, editChallenge, createChallenge, deleteChallenge,
      archiveExpiredChallenge, completeChallengeImmediately,
      selectAllHabitsToday, resetAllHabitsToday,
      linkHabitToChallenge, unlinkHabitFromChallenge, linkAllHabitsToChallenge,
      completeOnboarding, resetAll, pushAllData, seedRandomHistory,
      getStreakForHabit, getOverallStreak, getLast30Days, getLastNDays,
      todayStr,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
