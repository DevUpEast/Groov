import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert, Platform, TextInput, Linking,
} from 'react-native';
import SafeAreaView from '../components/SafeAreaView';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import TimePicker from '../components/TimePicker';
import Dialog from '../components/ui/Dialog';
import { sendTestNotification } from '../utils/notifications';
import feedback, { EVENTS, recent as recentFeedback, clearRecent as clearFeedbackLog } from '../services/feedback';
import { to12h, to24h, formatTime12 as formatTime } from '../utils/time';
import { exportBackup, pickBackup } from '../services/backup';
import { openRateApp } from '../services/review';
import WhatsNewSheet from '../components/WhatsNewSheet';
import LinkAccountSheet from '../components/LinkAccountSheet';
import { WIDGET_NAME } from '../widgets/widgetData';
import { summarizeBackup } from '../utils/backup';
import { t, getLocale, useLocale, setLocale, SUPPORTED_LOCALES } from '../i18n';
import AppText from '../components/ui/AppText';
import SectionLabel from '../components/ui/SectionLabel';
import SegmentedControl from '../components/ui/SegmentedControl';
import { useDevFlag, setDevFlag } from '../utils/devFlags';
import { space, radius } from '../theme/tokens';

// Secret code for first-time dev unlock (tap version label 7× then enter)
const DEV_CODE = 'devmode';

// Switch colours (F-02): the on track is the action fill and its thumb the onAction colour
// (ink on #818CF8 in dark, 5.98:1; a white thumb there is 2.98:1); off is switchThumb on
// switchTrackOff (white on slate in light, a muted #CBD5E1 on #334155 in dark, so an off row
// does not outshine an on one). react-native-web ignores thumbColor for the on state and
// draws its own teal unless activeThumbColor is set.
// A dimmed Switch (master off or permission missing, F-07): the disabledContainer track and
// the off thumb, never an opacity, so it reads as unavailable rather than faded.
export function switchColors(theme, on, disabled = false) {
  if (disabled) {
    return {
      trackColor: { false: theme.disabledContainer, true: theme.disabledContainer },
      thumbColor: theme.switchThumb,
      activeThumbColor: theme.switchThumb,
      ios_backgroundColor: theme.disabledContainer,
    };
  }
  return {
    trackColor: { false: theme.switchTrackOff, true: theme.action },
    thumbColor: on ? theme.onAction : theme.switchThumb,
    activeThumbColor: theme.onAction,
    ios_backgroundColor: theme.switchTrackOff,
  };
}

// "v1.2.0 (7)": app version from app.json, native build number from the binary.
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const BUILD_NUMBER = Application.nativeBuildVersion;
const VERSION_LABEL = `Groov v${APP_VERSION}${BUILD_NUMBER ? ` (${BUILD_NUMBER})` : ''}`;

// Static site in site/, deployed by Cloudflare Pages at isaaceast.com/groov.
const SITE_URL = 'https://isaaceast.com/groov';
const PRIVACY_URL = `${SITE_URL}/privacy-policy`;
const TERMS_URL = `${SITE_URL}/terms`;
const SUPPORT_URL = `${SITE_URL}/support`;
// Public issue tracker doubles as the feedback channel until a support mailbox exists.
const FEEDBACK_URL = 'https://github.com/DevUpEast/Groov/issues/new?labels=feedback&title=Feedback%3A%20';
// One Feedback log line: wall time, offset from the triggering tap, the planned beat and the
// drift from it (C-06a: "@750 Δ+12" = planned at 750 ms, fired 12 ms late), event, what fired.
// Developer tooling; the event and call names are code identifiers, never translated.
function formatFeedbackEntry(e) {
  const d = new Date(e.t);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  const what = e.frames ? `frames ${e.frames.first}-${e.frames.last} (${e.frames.count}) plan -${e.frames.planEnd}` : e.dropped ? 'dropped' : e.haptic ? e.haptic : `sound:${e.sound}`;
  const beat = typeof e.target === 'number' ? `  @${e.target} Δ${e.drift >= 0 ? '+' : ''}${e.drift}` : '';
  return `${time}  +${e.offset}ms${beat}  ${e.event}  ${what}`;
}

const SUPPORT_EMAIL = null; // e.g. 'support@example.com' — when set, Feedback opens mail instead

function feedbackMailto() {
  const subject = encodeURIComponent(`Groov feedback (${VERSION_LABEL}, ${Platform.OS})`);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
}

const THEME_OPTIONS = ['light', 'dark', 'system'];


function Row({ label, sublabel, sublabelColor, right, theme, onPress }) {
  const content = (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSub, { color: sublabelColor ?? theme.textSecondary }]}>{sublabel}</Text>}
      </View>
      <View style={styles.rowRight}>{right}</View>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// One reminder entry: label (editable for global reminders), enabled switch, time + remove.
// `permitted` is false when the OS has not granted notifications: a stored-on reminder
// then shows as off ("Off · Tap to allow") because it cannot fire, and tapping it asks
// for permission through `onAllow` (resolves true when granted).
function ReminderBlock({ theme, label, icon, badge, sublabel, enabled, masterOn, permitted = true, onAllow, time, onToggle, onTime, onRemove, editing, labelDraft, onLabelDraft, onLabelSave, onStartEdit }) {
  const blocked = masterOn && enabled && !permitted;
  // The time chip follows the switch: dimmed and inert while off, master-off or denied.
  const timeActive = masterOn && enabled && permitted;
  const toggle = async () => {
    if (!masterOn) return;
    if (!permitted) {
      const ok = await onAllow?.();
      if (ok && !enabled) onToggle();
      return;
    }
    onToggle();
  };
  const sublabelText = !masterOn ? t('settings.notificationsDisabled')
    : blocked ? t('settings.offTapToAllow')
    : sublabel ?? t('settings.firesAt', { time: formatTime(time) });
  return (
    <View style={[styles.reminderBlock, { borderTopColor: theme.border }]}>
      <View style={styles.reminderLabelRow}>
        {editing ? (
          <TextInput
            style={[styles.labelInput, { color: theme.text, borderColor: theme.border }]}
            value={labelDraft}
            onChangeText={onLabelDraft}
            onBlur={onLabelSave}
            onSubmitEditing={onLabelSave}
            autoFocus
            returnKeyType="done"
            accessibilityLabel={t('settings.reminderLabelA11y')}
          />
        ) : (
          <TouchableOpacity
            onPress={blocked ? onAllow : onStartEdit}
            style={{ flex: 1 }}
            activeOpacity={blocked || onStartEdit ? 0.7 : 1}
            accessibilityRole={blocked || onStartEdit ? 'button' : undefined}
            accessibilityLabel={blocked ? t('settings.allowA11y', { label }) : onStartEdit ? t('settings.editLabelA11y', { label }) : undefined}
          >
            <View style={styles.reminderLabelInner}>
              {!!icon && <Text style={styles.habitReminderIcon}>{icon}</Text>}
              <Text style={[styles.reminderLabel, { color: theme.text }]}>{label}</Text>
              {!!badge && (
                <View style={[styles.habitBadge, { backgroundColor: theme.selection }]}>
                  <Text style={[styles.habitBadgeText, { color: theme.onSelection }]}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.reminderSublabel, { color: blocked ? theme.link : theme.textSecondary }]}>
              {sublabelText}
            </Text>
          </TouchableOpacity>
        )}
        <Switch
          value={enabled && masterOn && permitted}
          onValueChange={(v) => { feedback.toggled(v); toggle(v); }}
          {...switchColors(theme, enabled && masterOn && permitted, !(masterOn && permitted))}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !masterOn }}
        />
      </View>
      <View style={styles.reminderActionsRow}>
        <TouchableOpacity
          style={[styles.timeBtn, timeActive ? { borderColor: theme.border } : { borderColor: theme.disabledContainer, backgroundColor: theme.disabledContainer }]}
          onPress={() => timeActive && onTime()}
          accessibilityRole="button"
          accessibilityLabel={t('settings.changeTimeA11y', { time: formatTime(time) })}
          accessibilityState={{ disabled: !timeActive }}
        >
          <Text style={[styles.timeBtnText, { color: timeActive ? theme.link : theme.onDisabled }]}>{formatTime(time)}</Text>
        </TouchableOpacity>
        {onRemove && (
          <TouchableOpacity style={styles.deleteReminderBtn} onPress={onRemove} accessibilityRole="button" accessibilityLabel={t('settings.removeReminderA11y')}>
            <Ionicons name="trash-outline" size={18} color={theme.dangerText} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Section({ title, children, theme }) {
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <SectionLabel label={title} theme={theme} first style={styles.sectionTitle} />
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const {
    settings, updateSettings, theme, resetAll, dateOffset, setDateOffset, habits, updateHabit, pushAllData, seedRandomHistory, devMode, setDevMode,
    allHabits, completions, notes, moods, challenges, pastChallenges, dailySnapshot, accountCreatedAt, lastBackupAt, markBackedUp, importBackup,
    ensureNotificationPermission, notificationPermission, isPro, openPaywall, canAddReminder,
  } = useApp();
  const { locale, preference: localePreference } = useLocale();
  const [langModal, setLangModal] = useState(false);
  const localeLabel = SUPPORTED_LOCALES.find(l => l.code === locale)?.label ?? locale;
  const languageSub = localePreference ? localeLabel : t('settings.languageSystemSub', { label: localeLabel });
  const chooseLocale = (code) => {
    feedback.play(EVENTS.selection);
    setLocale(code);
    setLangModal(false);
  };

  const [whatsNew, setWhatsNew] = useState(false);
  const handleRate = async () => {
    const ok = await openRateApp();
    if (!ok) Alert.alert(t('settings.about.rateThanks.title'), t('settings.about.rateThanks.body'));
  };
  const handleFeedback = () => {
    Linking.openURL(SUPPORT_EMAIL ? feedbackMailto() : FEEDBACK_URL).catch(() => {});
  };

  // ── Backup / restore ─────────────────────────────────────────────────────────
  const [backupBusy, setBackupBusy] = useState(false);
  const lastBackupLabel = lastBackupAt
    ? t('settings.backup.lastBackup', {
      date: new Date(lastBackupAt).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }),
      time: new Date(lastBackupAt).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' }),
    })
    : t('settings.backup.never');

  const handleExport = async () => {
    setBackupBusy(true);
    try {
      await exportBackup({ habits: allHabits, completions, notes, moods, settings, challenges, pastChallenges, dailySnapshot, accountCreatedAt });
      markBackedUp();
    } catch (e) {
      Alert.alert(t('settings.backup.exportFailed.title'), e.message || t('settings.backup.exportFailed.body'));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImport = async () => {
    let picked;
    try {
      picked = await pickBackup();
    } catch (e) {
      Alert.alert(t('settings.backup.cannotImport.title'), e.message || t('settings.backup.cannotImport.body'));
      return;
    }
    if (!picked) return;
    const when = picked.exportedAt ? new Date(picked.exportedAt).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' }) : t('settings.backup.restoreDialog.unknownDate');
    feedback.play(EVENTS.destructiveConfirm);
    Alert.alert(
      t('settings.backup.restoreDialog.title'),
      t('settings.backup.restoreDialog.body', { when, summary: summarizeBackup(picked.data) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.backup.restoreDialog.replace'), style: 'destructive', onPress: () => runImport(picked.data, 'replace') },
        { text: t('settings.backup.restoreDialog.merge'), onPress: () => runImport(picked.data, 'merge') },
      ],
    );
  };

  const runImport = async (data, mode) => {
    setBackupBusy(true);
    try {
      await importBackup(data, mode);
      Alert.alert(t('settings.backup.restored.title'), mode === 'replace' ? t('settings.backup.restored.replaced') : t('settings.backup.restored.merged'));
    } catch (e) {
      Alert.alert(t('settings.backup.importFailed.title'), e.message || t('settings.backup.importFailed.body'));
    } finally {
      setBackupBusy(false);
    }
  };
  const { user, signOut, displayName, updateDisplayName, deleteAccount, sendPasswordReset, verifyPasswordReset, authProvider, isAnonymous } = useAuth();
  const [linkSheet, setLinkSheet] = useState(false);
  // "Account linked" shows once the link sheet has gone (iOS cannot present an Alert over a
  // Modal that is still dismissing).
  const linkedAlert = useRef(false);
  // True once the link sheet has gone (its onDismiss ran) until it opens again: a link that
  // completes after the sheet was closed alerts at once (F-10 review m1).
  const linkSheetGone = useRef(true);
  useEffect(() => { if (linkSheet) linkSheetGone.current = false; }, [linkSheet]);
  // Apple/Google accounts have no Groov password to reset.
  const canResetPassword = authProvider === 'email';

  const handleSignOut = () => {
    if (isAnonymous) {
      // A guest has no way back in: signing out orphans the account and its data.
      feedback.play(EVENTS.destructiveConfirm);
      Alert.alert(
        t('settings.account.signOutGuest.title'),
        t('settings.account.signOutGuest.body'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('settings.account.signOutGuest.add'), onPress: () => setLinkSheet(true) },
          { text: t('settings.account.signOutGuest.anyway'), style: 'destructive', onPress: () => signOut() },
        ],
      );
      return;
    }
    feedback.play(EVENTS.destructiveConfirm);
    Alert.alert(t('settings.account.signOut'), t('settings.account.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.account.signOut'), style: 'destructive', onPress: async () => {
          try { await pushAllData(); } catch (e) {}
          signOut();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    feedback.play(EVENTS.destructiveConfirm);
    Alert.alert(
      t('settings.account.deleteAccount.title'),
      t('settings.account.deleteAccount.body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.account.deleteAccount.title'),
          style: 'destructive',
          onPress: () => {
            feedback.play(EVENTS.destructiveConfirm);
            Alert.alert(
              t('settings.account.deleteAccount.sure'),
              t('settings.account.deleteAccount.sureBody'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('settings.account.deleteAccount.yes'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                    } catch (e) {
                      Alert.alert(t('common.error'), e.message || t('settings.account.deleteAccount.failed'));
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  // Password reset state (from Settings)
  const [resetStep, setResetStep] = useState(null); // null | 'sent' | 'verify'
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  const handleResetPassword = () => {
    Alert.alert(
      t('settings.data.resetPassword'),
      t('settings.data.resetDialogBody', { email: user?.email ?? t('settings.data.yourEmail') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.data.sendCode'),
          onPress: async () => {
            setResetLoading(true);
            setResetError('');
            try {
              await sendPasswordReset(user?.email ?? '');
              setResetStep('verify');
              setResetCode('');
              setResetNewPassword('');
              setResetConfirmPassword('');
            } catch (e) {
              Alert.alert(t('common.error'), e.message || t('settings.data.sendFailed'));
            } finally {
              setResetLoading(false);
            }
          },
        },
      ]
    );
  };

  // An Alert to show after a Dialog closes; flushed from the Dialog's onDismiss.
  const afterDialogAlert = useRef(null);
  const flushAfterDialogAlert = () => {
    const pending = afterDialogAlert.current;
    afterDialogAlert.current = null;
    if (pending) Alert.alert(...pending);
  };

  const handleVerifyReset = async () => {
    if (!resetCode.trim()) { setResetError(t('settings.resetModal.errors.enterCode')); return; }
    if (!resetNewPassword) { setResetError(t('settings.resetModal.errors.enterPassword')); return; }
    if (resetNewPassword.length < 8) { setResetError(t('settings.resetModal.errors.min8')); return; }
    if (resetNewPassword !== resetConfirmPassword) { setResetError(t('settings.resetModal.errors.mismatch')); return; }
    setResetLoading(true);
    setResetError('');
    try {
      await verifyPasswordReset(user?.email ?? '', resetCode, resetNewPassword);
      // Shown from the Dialog's onDismiss, once the dialog has gone (iOS cannot present over it).
      afterDialogAlert.current = [t('settings.resetModal.success.title'), t('settings.resetModal.success.body')];
      setResetStep(null);
    } catch (e) {
      setResetError(e.message || t('settings.resetModal.errors.invalidCode'));
    } finally {
      setResetLoading(false);
    }
  };

  const [timeModal, setTimeModal] = useState(null);
  const [editingLabel, setEditingLabel] = useState(null);
  const [labelDraft, setLabelDraft] = useState('');

  // Display name editor
  const [nameModal, setNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef(null);
  const openNameEditor = () => { setNameDraft(displayName ?? ''); setNameModal(true); };
  const saveName = async () => {
    const next = nameDraft.trim();
    if (next === (displayName ?? '')) { setNameModal(false); return; }
    setNameSaving(true);
    try {
      await updateDisplayName(next);
      setNameModal(false);
    } catch (e) {
      Alert.alert(t('common.error'), e.message || t('settings.account.nameModal.failed'));
    } finally {
      setNameSaving(false);
    }
  };

  // Dev tools — unlocked per device; state lives in AppContext (persisted via SecureStore)
  const [devTapCount, setDevTapCount] = useState(0);
  const [showDevInput, setShowDevInput] = useState(false);
  const [devCodeDraft, setDevCodeDraft] = useState('');
  const devInputRef = useRef(null);
  const devTapTimer = useRef(null);
  const showDevTools = devMode;
  const choreography = useDevFlag('choreography');
  const frameLog = useDevFlag('frameLog');
  // Throws during render so the root ErrorBoundary (and Sentry, when configured) can be exercised.
  const [crashTest, setCrashTest] = useState(false);
  // Dev: the feedback service's ring buffer (null = closed). A snapshot, re-read on each open.
  const [feedbackLog, setFeedbackLog] = useState(null);
  if (crashTest) throw new Error('Test crash from Settings dev tools');

  const handleVersionTap = () => {
    if (showDevTools) return;
    const next = devTapCount + 1;
    setDevTapCount(next);
    clearTimeout(devTapTimer.current);
    devTapTimer.current = setTimeout(() => setDevTapCount(0), 2000);
    if (next >= 7) {
      setDevTapCount(0);
      setShowDevInput(true);
    }
  };

  const handleDevCodeSubmit = async () => {
    if (devCodeDraft === DEV_CODE) {
      setDevMode(true);
      afterDialogAlert.current = [t('settings.dev.unlocked.title'), t('settings.dev.unlocked.body')];
      setShowDevInput(false);
      setDevCodeDraft('');
    } else {
      Alert.alert(t('settings.dev.invalid.title'), t('settings.dev.invalid.body'));
      setDevCodeDraft('');
    }
  };

  // Global reminders live in settings.reminders; per-habit reminders live on the habit.
  // AppContext reschedules the OS notifications whenever either changes.
  const reminders = settings.reminders || [];
  const habitReminders = habits.filter(h => h.reminder && h.reminder.hour12 !== undefined);
  const masterOn = settings.notificationsEnabled;
  // Unknown (null) counts as permitted so the rows do not flash "Tap to allow" on launch.
  // Web has no OS permission to ask for; its master row already explains that.
  const permitted = Platform.OS === 'web' || notificationPermission == null || notificationPermission === 'granted';
  // Notifications are on in Groov but the OS has not allowed them: the master row is
  // the primary "Tap to allow" control (rows below also ask, but are dimmed).
  const masterBlocked = masterOn && !permitted;

  const updateReminders = (newReminders) => updateSettings({ reminders: newReminders });

  const toggleReminderEnabled = (idx) =>
    updateReminders(reminders.map((r, i) => i === idx ? { ...r, enabled: !r.enabled } : r));

  const updateReminderTime = (idx, time) =>
    updateReminders(reminders.map((r, i) => i === idx ? { ...r, time } : r));

  const removeReminder = (idx) => {
    feedback.play(EVENTS.destructiveConfirm);
    Alert.alert(t('settings.removeReminder.title'), t('settings.removeReminder.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => updateReminders(reminders.filter((_, i) => i !== idx)) },
    ]);
  };

  const addReminder = async () => {
    if (!canAddReminder()) return;
    if (!(await ensureNotificationPermission())) return;
    updateReminders([
      ...reminders,
      { id: `r-${Date.now()}`, label: t('settings.newReminderLabel'), time: { hour12: 12, minute: 0, ampm: 'PM' }, enabled: true },
    ]);
  };

  const toggleHabitReminder = (habit) =>
    updateHabit(habit.id, { reminder: { ...habit.reminder, enabled: !habit.reminder.enabled } });

  const updateHabitReminderTime = (habit, t) =>
    updateHabit(habit.id, { reminder: { ...habit.reminder, hour12: t.hour12, minute: t.minute, ampm: t.ampm, enabled: true } });

  const removeHabitReminder = (habit) => {
    feedback.play(EVENTS.destructiveConfirm);
    Alert.alert(t('settings.removeReminder.title'), t('settings.removeReminder.habitBody', { name: habit.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: () => updateHabit(habit.id, { reminder: { ...habit.reminder, enabled: false } }) },
    ]);
  };

  // Smart check-in: one-off evening nudge that only fires while habits are unfinished.
  const eveningTime = to12h(settings.eveningReminderHour ?? 20, settings.eveningReminderMinute ?? 0);
  const setEveningTime = (t) => {
    const { hour, minute } = to24h(t);
    updateSettings({ eveningReminderHour: hour, eveningReminderMinute: minute, eveningReminderEnabled: true });
  };

  const startEditLabel = (idx) => {
    setEditingLabel(idx);
    setLabelDraft(reminders[idx].label);
  };

  const saveLabel = () => {
    if (editingLabel === null) return;
    const next = reminders.map((r, i) => i === editingLabel ? { ...r, label: labelDraft.trim() || r.label } : r);
    updateSettings({ reminders: next });
    setEditingLabel(null);
  };

  const handleClearData = () => {
    feedback.play(EVENTS.destructiveConfirm);
    Alert.alert(
      t('settings.data.clear'),
      t('settings.data.clearBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.data.clearEverything'),
          style: 'destructive',
          onPress: async () => {
            await resetAll();
            Alert.alert(t('common.done'), t('settings.data.cleared'));
          },
        },
      ]
    );
  };

  const adjustDay = (delta) => {
    setDateOffset(prev => prev + delta);
  };

  const formattedDevDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + dateOffset);
    return d.toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  })();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <AppText variant="title" style={[styles.heading, { color: theme.text }]}>{t('settings.title')}</AppText>

        {/* Appearance */}
        <Section title={t('settings.appearance')} theme={theme}>
          <View style={[styles.row, styles.themeRow, { borderBottomColor: theme.border }]}>
            <View>
              <Text style={[styles.rowLabel, { color: theme.text }]}>{t('settings.theme')}</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                {settings.theme === 'system' ? t('settings.themeFollows') : settings.theme === 'dark' ? t('settings.themeAlwaysDark') : t('settings.themeAlwaysLight')}
              </Text>
            </View>
            <SegmentedControl
              style={styles.themeSegment}
              fill
              compact
              theme={theme}
              accessibilityLabel={t('settings.theme')}
              value={settings.theme ?? 'system'}
              onChange={opt => updateSettings({ theme: opt })}
              options={THEME_OPTIONS.map(opt => {
                const label = t(`settings.themeOptions.${opt}`);
                return { value: opt, label, accessibilityLabel: t('settings.themeA11y', { label }) };
              })}
            />
          </View>
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: 'transparent' }]}
            onPress={() => setLangModal(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${t('settings.language')}, ${languageSub}`}
          >
            <View style={styles.rowLeft}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>{t('settings.language')}</Text>
              <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{languageSub}</Text>
            </View>
            <Ionicons name="language-outline" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </Section>

        {/* Notifications */}
        <Section title={t('settings.notifications')} theme={theme}>
          <Row
            label={t('settings.enableNotifications')}
            sublabel={masterBlocked ? t('settings.offTapToAllow') : Platform.OS === 'web' ? t('settings.enableSubWeb') : t('settings.enableSub')}
            sublabelColor={masterBlocked ? theme.link : undefined}
            onPress={masterBlocked ? ensureNotificationPermission : undefined}
            theme={theme}
            right={
              <Switch
                value={settings.notificationsEnabled && permitted}
                onValueChange={async v => {
                  if (v && !(await ensureNotificationPermission())) return;
                  feedback.toggled(v);
                  updateSettings({ notificationsEnabled: v });
                }}
                {...switchColors(theme, settings.notificationsEnabled && permitted)}
                accessibilityLabel={t('settings.enableNotifications')}
              />
            }
          />

          <ReminderBlock
            theme={theme}
            icon="🌙"
            label={t('settings.smartCheckin')}
            sublabel={masterOn ? t('settings.smartSub', { time: formatTime(eveningTime) }) : undefined}
            enabled={!!settings.eveningReminderEnabled}
            masterOn={masterOn}
            permitted={permitted}
            onAllow={ensureNotificationPermission}
            time={eveningTime}
            onToggle={async () => {
              if (!settings.eveningReminderEnabled && !(await ensureNotificationPermission())) return;
              updateSettings({ eveningReminderEnabled: !settings.eveningReminderEnabled });
            }}
            onTime={() => setTimeModal({ kind: 'evening' })}
          />

          {reminders.map((r, i) => (
            <ReminderBlock
              key={r.id ?? i}
              theme={theme}
              label={r.label}
              enabled={r.enabled}
              masterOn={masterOn}
              permitted={permitted}
              onAllow={ensureNotificationPermission}
              time={r.time}
              onToggle={() => toggleReminderEnabled(i)}
              onTime={() => setTimeModal({ kind: 'reminder', idx: i })}
              onRemove={() => removeReminder(i)}
              editing={editingLabel === i}
              labelDraft={labelDraft}
              onLabelDraft={setLabelDraft}
              onLabelSave={saveLabel}
              onStartEdit={() => startEditLabel(i)}
            />
          ))}

          {habitReminders.map(h => (
            <ReminderBlock
              key={`habit-${h.id}`}
              theme={theme}
              icon={h.icon ?? '🔔'}
              label={h.name}
              badge={t('settings.habitBadge')}
              enabled={!!h.reminder.enabled}
              masterOn={masterOn}
              permitted={permitted}
              onAllow={ensureNotificationPermission}
              time={h.reminder}
              onToggle={() => toggleHabitReminder(h)}
              onTime={() => setTimeModal({ kind: 'habit', id: h.id })}
              onRemove={() => removeHabitReminder(h)}
            />
          ))}

          <TouchableOpacity
            style={[styles.addReminderBtn, { borderColor: masterOn ? theme.border : theme.disabledContainer }]}
            onPress={() => masterOn && addReminder()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('settings.addReminder')}
            accessibilityState={{ disabled: !masterOn }}
          >
            <Ionicons name="add-circle-outline" size={18} color={masterOn ? theme.link : theme.onDisabled} />
            <Text style={[styles.addReminderText, { color: masterOn ? theme.link : theme.onDisabled }]}>{t('settings.addReminder')}</Text>
          </TouchableOpacity>
        </Section>

        {/* Feedback */}
        <Section title={t('settings.feedback')} theme={theme}>
          <Row
            label={t('settings.sounds')}
            sublabel={t('settings.soundsSub')}
            theme={theme}
            right={
              <Switch
                value={settings.soundEnabled}
                onValueChange={v => {
                  feedback.toggled(v);
                  updateSettings({ soundEnabled: v });
                  if (v) feedback.play(EVENTS.soundPreview);
                }}
                {...switchColors(theme, settings.soundEnabled)}
                accessibilityLabel={t('settings.sounds')}
              />
            }
          />
          <Row
            label={t('settings.haptics')}
            sublabel={t('settings.hapticsSub')}
            theme={theme}
            right={
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={v => {
                  // updateSettings applies the gate synchronously: turning haptics on is felt.
                  updateSettings({ hapticsEnabled: v });
                  feedback.toggled(v);
                }}
                {...switchColors(theme, settings.hapticsEnabled)}
                accessibilityLabel={t('settings.haptics')}
              />
            }
          />
        </Section>

        {/* Dev Tools — only visible in development builds after entering the code */}
        {showDevTools && (
          <Section title={t('settings.dev.title')} theme={theme}>
            {/* Date offset */}
            <View style={[styles.row, { borderBottomColor: theme.border }]}>
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>{t('settings.dev.simulatedDate')}</Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{formattedDevDate}</Text>
                {dateOffset !== 0 && (
                  <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                    {t('settings.dev.offset', { count: Math.abs(dateOffset), offset: `${dateOffset > 0 ? '+' : ''}${dateOffset}` })}
                  </Text>
                )}
              </View>
              <View style={styles.devDayControls}>
                <TouchableOpacity style={[styles.devBtn, { borderColor: theme.border }]} onPress={() => adjustDay(-1)} accessibilityRole="button" accessibilityLabel={t('settings.dev.prevDay')}>
                  <Text style={[styles.devBtnText, { color: theme.text }]}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.devBtn, { borderColor: theme.border }]}
                  onPress={() => setDateOffset(0)}
                  accessibilityRole="button"
                  accessibilityLabel={t('settings.dev.resetDate')}
                >
                  <Text style={[styles.devBtnText, { color: theme.textSecondary, fontSize: 12 }]}>{t('settings.dev.now')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.devBtn, { borderColor: theme.border }]} onPress={() => adjustDay(1)} accessibilityRole="button" accessibilityLabel={t('settings.dev.nextDay')}>
                  <Text style={[styles.devBtnText, { color: theme.text }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Simulate push notification */}
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={async () => {
                await sendTestNotification(habits[0]);
                Alert.alert(t('settings.dev.sent.title'), t('settings.dev.sent.body'));
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('settings.dev.sendTest')}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>{t('settings.dev.sendTest')}</Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{t('settings.dev.sendTestSub')}</Text>
              </View>
              <Ionicons name="notifications-outline" size={20} color={theme.link} />
            </TouchableOpacity>

            {/* Seed 30-day random history */}
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={() => {
                Alert.alert(
                  t('settings.dev.seed.title'),
                  t('settings.dev.seed.body'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('settings.dev.seed.generate'), onPress: async () => {
                        await seedRandomHistory();
                        Alert.alert(t('common.done'), t('settings.dev.seed.done'));
                      },
                    },
                  ]
                );
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('settings.dev.seed.title')}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>{t('settings.dev.seed.title')}</Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{t('settings.dev.seed.sub')}</Text>
              </View>
              <Ionicons name="calendar-outline" size={20} color={theme.link} />
            </TouchableOpacity>

            {/* Feedback log: what fired, and when, relative to the tap (plan §7.4) */}
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={() => setFeedbackLog(recentFeedback())}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('settings.dev.feedbackLog.title')}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>{t('settings.dev.feedbackLog.title')}</Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{t('settings.dev.feedbackLog.sub')}</Text>
              </View>
              <Ionicons name="pulse-outline" size={20} color={theme.link} />
            </TouchableOpacity>

            {/* C-06a: the check-off timeline, device-local (devFlags), the rollback for C-06b/C-07 */}
            <Row
              label={t('settings.dev.choreography.title')}
              sublabel={t('settings.dev.choreography.sub')}
              theme={theme}
              right={
                <Switch
                  value={choreography}
                  onValueChange={v => { feedback.toggled(v); setDevFlag('choreography', v); }}
                  {...switchColors(theme, choreography)}
                  accessibilityLabel={t('settings.dev.choreography.title')}
                />
              }
            />

            {/* C-06b: animation frame times in the Feedback log on release builds (dev builds always log) */}
            <Row
              label={t('settings.dev.frameLog.title')}
              sublabel={t('settings.dev.frameLog.sub')}
              theme={theme}
              right={
                <Switch
                  value={frameLog}
                  onValueChange={v => { feedback.toggled(v); setDevFlag('frameLog', v); }}
                  {...switchColors(theme, frameLog)}
                  accessibilityLabel={t('settings.dev.frameLog.title')}
                />
              }
            />

            {/* Crash test */}
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={() => {
                feedback.play(EVENTS.destructiveConfirm);
                Alert.alert(t('settings.dev.crash.title'), t('settings.dev.crash.body'), [
                  { text: t('common.cancel'), style: 'cancel' },
                  { text: t('settings.dev.crash.crash'), style: 'destructive', onPress: () => setCrashTest(true) },
                ]);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('settings.dev.crash.title')}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>{t('settings.dev.crash.title')}</Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{t('settings.dev.crash.sub')}</Text>
              </View>
              <Ionicons name="warning-outline" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            {/* Lock dev tools */}
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: 'transparent' }]}
              onPress={() => {
                feedback.play(EVENTS.destructiveConfirm);
                Alert.alert(
                  t('settings.dev.disable.title'),
                  t('settings.dev.disable.body'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('settings.dev.disable.disable'), style: 'destructive', onPress: () => setDevMode(false),
                    },
                  ]
                );
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('settings.dev.disable.title')}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.dangerText }]}>{t('settings.dev.disable.title')}</Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]}>{t('settings.dev.disable.sub')}</Text>
              </View>
              <Ionicons name="lock-closed-outline" size={20} color={theme.dangerText} />
            </TouchableOpacity>
          </Section>
        )}

        {/* Pro */}
        <Section title={t('settings.pro.title')} theme={theme}>
          <Row
            label={isPro ? t('settings.pro.have') : t('settings.pro.upgrade')}
            sublabel={isPro ? t('settings.pro.haveSub') : t('settings.pro.upgradeSub')}
            theme={theme}
            onPress={isPro ? undefined : () => openPaywall('settings')}
            right={<Ionicons name={isPro ? 'checkmark-circle' : 'sparkles-outline'} size={20} color={theme.link} />}
          />
        </Section>

        {/* Account */}
        <Section title={t('settings.account.title')} theme={theme}>
          <Row
            label={t('settings.account.displayName')}
            sublabel={displayName || t('settings.account.displayNameSub')}
            theme={theme}
            onPress={openNameEditor}
            right={<Ionicons name="create-outline" size={18} color={theme.textSecondary} />}
          />
          {isAnonymous ? (
            <Row
              label={t('settings.account.guest')}
              sublabel={t('settings.account.guestSub')}
              theme={theme}
              onPress={() => setLinkSheet(true)}
              right={<View style={[styles.linkPill, { backgroundColor: theme.action }]}><Text style={[styles.linkPillText, { color: theme.onAction }]}>{t('settings.account.addSignIn')}</Text></View>}
            />
          ) : (
            <Row
              label={t('settings.account.signedInAs')}
              sublabel={user?.email ?? (authProvider === 'apple' ? t('settings.account.appleId') : authProvider === 'google' ? t('settings.account.googleAccount') : '')}
              theme={theme}
              right={null}
            />
          )}
          <TouchableOpacity
            style={[styles.dangerRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel={t('settings.account.signOut')}
          >
            <Text style={[styles.dangerText, { color: theme.dangerText }]}>{t('settings.account.signOut')}</Text>
          </TouchableOpacity>
        </Section>

        {/* Backup */}
        <Section title={t('settings.backup.title')} theme={theme}>
          <Row
            label={t('settings.backup.export')}
            sublabel={t('settings.backup.exportSub', { last: lastBackupLabel })}
            theme={theme}
            onPress={backupBusy ? undefined : handleExport}
            right={<Ionicons name="share-outline" size={20} color={theme.link} />}
          />
          <Row
            label={t('settings.backup.restore')}
            sublabel={t('settings.backup.restoreSub')}
            theme={theme}
            onPress={backupBusy ? undefined : handleImport}
            right={<Ionicons name="download-outline" size={20} color={theme.link} />}
          />
          {!lastBackupAt && (
            <Text style={[styles.backupHint, { color: theme.textSecondary }]}>{t('settings.backup.hint')}</Text>
          )}
        </Section>

        {/* Data */}
        <Section title={t('settings.data.title')} theme={theme}>
          {canResetPassword && (
            <TouchableOpacity
              style={[styles.dangerRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
              onPress={handleResetPassword}
              disabled={resetLoading}
              accessibilityRole="button"
              accessibilityLabel={t('settings.data.resetPasswordA11y')}
              accessibilityState={{ disabled: resetLoading }}
            >
              <Text style={[styles.dangerText, { color: theme.link }]}>{t('settings.data.resetPassword')}</Text>
              <Text style={[styles.dangerSub, { color: theme.textSecondary }]}>
                {t('settings.data.resetPasswordSub')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.dangerRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
            onPress={handleClearData}
            accessibilityRole="button"
            accessibilityLabel={t('settings.data.clearA11y')}
          >
            <Text style={[styles.dangerText, { color: theme.dangerText }]}>{t('settings.data.clear')}</Text>
            <Text style={[styles.dangerSub, { color: theme.textSecondary }]}>
              {t('settings.data.clearSub')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dangerRow}
            onPress={handleDeleteAccount}
            accessibilityRole="button"
            accessibilityLabel={t('settings.data.deleteA11y')}
          >
            <Text style={[styles.dangerText, { color: theme.dangerText }]}>{t('settings.data.deleteAccount')}</Text>
            <Text style={[styles.dangerSub, { color: theme.textSecondary }]}>
              {t('settings.data.deleteSub')}
            </Text>
          </TouchableOpacity>
        </Section>

        {/* About */}
        <Section title={t('settings.about.title')} theme={theme}>
          {Platform.OS === 'android' && (
            <Row
              label={t('settings.about.widget')}
              sublabel={t('settings.about.widgetSub')}
              theme={theme}
              onPress={async () => {
                try {
                  const { requestPinWidget } = require('react-native-android-widget');
                  const ok = await requestPinWidget({ widgetName: WIDGET_NAME });
                  if (!ok) Alert.alert(t('settings.about.widgetUnsupported.title'), t('settings.about.widgetUnsupported.body'));
                } catch (e) {
                  Alert.alert(t('settings.about.widgetFailed.title'), e?.message || t('settings.about.widgetFailed.body'));
                }
              }}
              right={<Ionicons name="grid-outline" size={18} color={theme.link} />}
            />
          )}
          <Row
            label={t('settings.about.rate')}
            sublabel={t('settings.about.rateSub')}
            theme={theme}
            onPress={handleRate}
            right={<Ionicons name="star-outline" size={18} color={theme.textSecondary} />}
          />
          <Row
            label={t('settings.about.feedback')}
            sublabel={SUPPORT_EMAIL ? t('settings.about.feedbackEmail') : t('settings.about.feedbackSub')}
            theme={theme}
            onPress={handleFeedback}
            right={<Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.textSecondary} />}
          />
          <Row
            label={t('settings.about.whatsNew')}
            sublabel={t('settings.about.whatsNewSub', { version: VERSION_LABEL })}
            theme={theme}
            onPress={() => setWhatsNew(true)}
            right={<Ionicons name="sparkles-outline" size={18} color={theme.textSecondary} />}
          />
          <Row
            label={t('settings.about.help')}
            theme={theme}
            onPress={() => Linking.openURL(SUPPORT_URL).catch(() => {})}
            right={<Ionicons name="open-outline" size={18} color={theme.textSecondary} />}
          />
          <Row
            label={t('settings.about.privacy')}
            sublabel={t('settings.about.privacySub')}
            theme={theme}
            onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
            right={<Ionicons name="open-outline" size={18} color={theme.textSecondary} />}
          />
          <Row
            label={t('settings.about.terms')}
            theme={theme}
            onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
            right={<Ionicons name="open-outline" size={18} color={theme.textSecondary} />}
          />
        </Section>

        <TouchableOpacity onPress={handleVersionTap} activeOpacity={0.7} style={styles.versionBtn} accessibilityRole="button" accessibilityLabel={VERSION_LABEL}>
          <Text style={[styles.version, { color: theme.textSecondary }]}>{VERSION_LABEL}</Text>
          {devTapCount > 2 && !showDevTools && (
            <Text style={[styles.devHint, { color: theme.textSecondary }]}>
              {t('settings.dev.moreTaps', { count: 7 - devTapCount })}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <WhatsNewSheet visible={whatsNew} onClose={() => setWhatsNew(false)} theme={theme} currentVersion={APP_VERSION} />
      <LinkAccountSheet
        visible={linkSheet}
        theme={theme}
        onClose={() => setLinkSheet(false)}
        onLinked={() => {
          if (linkSheetGone.current) {
            Alert.alert(t('settings.account.linked.title'), t('settings.account.linked.body'));
            return;
          }
          linkedAlert.current = true;
          setLinkSheet(false);
        }}
        onDismiss={() => {
          linkSheetGone.current = true;
          if (!linkedAlert.current) return;
          linkedAlert.current = false;
          Alert.alert(t('settings.account.linked.title'), t('settings.account.linked.body'));
        }}
      />

      {/* Dev: feedback log */}
      <Dialog
        visible={!!feedbackLog}
        onClose={() => setFeedbackLog(null)}
        title={t('settings.dev.feedbackLog.title')}
        body={feedbackLog && feedbackLog.length === 0 ? t('settings.dev.feedbackLog.empty') : undefined}
        actions={[
          { label: t('settings.dev.feedbackLog.clear'), onPress: () => { clearFeedbackLog(); setFeedbackLog([]); } },
          { label: t('common.close'), variant: 'primary', onPress: () => setFeedbackLog(null) },
        ]}
      >
        {(feedbackLog || []).slice().reverse().map((e, i) => (
          <Text key={`${e.t}-${i}`} style={[styles.feedbackLogLine, { color: theme.text }]}>{formatFeedbackEntry(e)}</Text>
        ))}
      </Dialog>

      {/* Password Reset dialog */}
      <Dialog
        visible={resetStep === 'verify'}
        onDismiss={flushAfterDialogAlert}
        onClose={() => { setResetStep(null); setResetError(''); }}
        dismissable={!resetLoading}
        title={t('settings.resetModal.title')}
        body={t('settings.resetModal.body', { email: user?.email ?? '' })}
        actions={[
          { key: 'cancel', label: t('common.cancel'), onPress: () => { setResetStep(null); setResetError(''); }, disabled: resetLoading },
          { key: 'set', label: t('settings.resetModal.setPassword'), loadingLabel: t('common.saving'), variant: 'primary', onPress: handleVerifyReset, loading: resetLoading },
        ]}
      >
        <TextInput
          style={[styles.dialogInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
          value={resetCode}
          onChangeText={setResetCode}
          accessibilityLabel={t('settings.resetModal.codePlaceholder')}
          placeholder={t('settings.resetModal.codePlaceholder')}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={[styles.dialogInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
          value={resetNewPassword}
          onChangeText={setResetNewPassword}
          accessibilityLabel={t('settings.resetModal.newPassword')}
          placeholder={t('settings.resetModal.newPassword')}
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
        />
        <TextInput
          style={[styles.dialogInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text, marginBottom: space.xxs }]}
          value={resetConfirmPassword}
          onChangeText={setResetConfirmPassword}
          accessibilityLabel={t('settings.resetModal.confirmPassword')}
          placeholder={t('settings.resetModal.confirmPassword')}
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
        />
        {!!resetError && (
          <Text style={[styles.dialogError, { color: theme.dangerText }]} accessibilityLiveRegion="polite">{resetError}</Text>
        )}
      </Dialog>

      {/* Display name dialog */}
      <Dialog
        visible={nameModal}
        onClose={() => setNameModal(false)}
        dismissable={!nameSaving}
        title={t('settings.account.nameModal.title')}
        body={t('settings.account.nameModal.sub')}
        initialFocusRef={nameInputRef}
        actions={[
          { key: 'cancel', label: t('common.cancel'), onPress: () => setNameModal(false), disabled: nameSaving },
          { key: 'save', label: t('common.save'), loadingLabel: t('common.saving'), variant: 'primary', onPress: saveName, loading: nameSaving },
        ]}
      >
        <TextInput
          ref={nameInputRef}
          style={[styles.dialogInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text, marginBottom: 0 }]}
          value={nameDraft}
          onChangeText={setNameDraft}
          accessibilityLabel={t('settings.account.nameModal.placeholder')}
          placeholder={t('settings.account.nameModal.placeholder')}
          placeholderTextColor={theme.textSecondary}
          maxLength={40}
          onSubmitEditing={saveName}
          returnKeyType="done"
        />
      </Dialog>

      {/* Dev code entry dialog */}
      <Dialog
        visible={showDevInput}
        onDismiss={flushAfterDialogAlert}
        onClose={() => { setShowDevInput(false); setDevCodeDraft(''); }}
        title={t('settings.dev.access.title')}
        body={t('settings.dev.access.body')}
        initialFocusRef={devInputRef}
        actions={[
          { key: 'cancel', label: t('common.cancel'), onPress: () => { setShowDevInput(false); setDevCodeDraft(''); } },
          { key: 'unlock', label: t('settings.dev.access.unlock'), variant: 'primary', onPress: handleDevCodeSubmit },
        ]}
      >
        <TextInput
          ref={devInputRef}
          style={[styles.dialogInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text, marginBottom: 0 }]}
          value={devCodeDraft}
          onChangeText={setDevCodeDraft}
          accessibilityLabel={t('settings.dev.access.a11y')}
          placeholder={t('settings.dev.access.placeholder')}
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          onSubmitEditing={handleDevCodeSubmit}
          returnKeyType="done"
        />
      </Dialog>

      {/* Language picker */}
      <Dialog
        visible={langModal}
        onClose={() => setLangModal(false)}
        title={t('settings.languageTitle')}
        body={t('settings.languageBody')}
        actions={[{ key: 'close', label: t('common.close'), onPress: () => setLangModal(false) }]}
      >
        <View accessibilityRole="radiogroup">
          {[{ code: null, label: t('settings.languageSystem') }, ...SUPPORTED_LOCALES].map(opt => {
            const selected = (localePreference ?? null) === opt.code;
            return (
              <TouchableOpacity
                key={opt.code ?? 'system'}
                style={[styles.langOption, { borderBottomColor: theme.border }]}
                onPress={() => chooseLocale(opt.code)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={opt.label}
              >
                <Text style={[styles.langOptionText, { color: selected ? theme.link : theme.text }]}>{opt.label}</Text>
                {selected && <Ionicons name="checkmark" size={18} color={theme.link} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Dialog>

      {timeModal && (() => {
        const habit = timeModal.kind === 'habit' ? habits.find(h => h.id === timeModal.id) : null;
        const current = timeModal.kind === 'evening' ? eveningTime
          : timeModal.kind === 'habit' ? habit?.reminder
          : reminders[timeModal.idx]?.time;
        if (!current) return null;
        return (
          <TimePicker
            visible={true}
            hour12={current.hour12 ?? 8}
            minute={current.minute ?? 0}
            ampm={current.ampm ?? 'AM'}
            onClose={() => setTimeModal(null)}
            onSave={t => {
              if (timeModal.kind === 'evening') setEveningTime(t);
              else if (timeModal.kind === 'habit') updateHabitReminderTime(habit, t);
              else updateReminderTime(timeModal.idx, t);
              setTimeModal(null);
            }}
            theme={theme}
          />
        );
      })()}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: space.xxl },
  heading: { marginBottom: space.lg },
  section: { borderRadius: radius.card, borderWidth: 1, marginBottom: space.lg, overflow: 'hidden' },
  sectionTitle: { paddingHorizontal: space.md, paddingTop: space.sm, marginBottom: 0, paddingBottom: space.xxs },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.md, paddingVertical: 14, borderBottomWidth: 1,
  },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowRight: { marginLeft: space.sm },
  themeRow: { flexDirection: 'column', alignItems: 'stretch' },
  themeSegment: { marginTop: space.sm },
  reminderBlock: {
    borderTopWidth: 1, paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.xs,
  },
  reminderLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  reminderLabelInner: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  habitReminderIcon: { fontSize: 16 },
  habitBadge: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  habitBadgeText: { fontSize: 12, fontWeight: '700' },
  labelInput: {
    flex: 1, fontSize: 15, fontWeight: '500', borderBottomWidth: 1,
    paddingVertical: 2, marginRight: space.xs,
  },
  reminderLabel: { fontSize: 15, fontWeight: '500' },
  reminderSublabel: { fontSize: 12, marginTop: 2 },
  reminderActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeBtn: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: 6, flex: 1 },
  timeBtnText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  deleteReminderBtn: { padding: 6 },
  addReminderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, margin: space.sm, padding: 10, borderRadius: radius.control, borderWidth: 1.5, borderStyle: 'dashed',
  },
  addReminderText: { fontSize: 14, fontWeight: '600' },
  devDayControls: { flexDirection: 'row', gap: 6 },
  devBtn: {
    width: 36, height: 36, borderRadius: radius.control, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  devBtnText: { fontSize: 16, fontWeight: '700' },
  feedbackLogLine: { fontSize: 12, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  backupHint: { fontSize: 12, lineHeight: 17, paddingHorizontal: space.md, paddingBottom: space.sm },
  linkPill: { borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 6 },
  linkPillText: { fontSize: 12, fontWeight: '700' },
  dangerRow: { paddingHorizontal: space.md, paddingVertical: 14 },
  dangerText: { fontSize: 15, fontWeight: '600' },
  dangerSub: { fontSize: 12, marginTop: 2 },
  version: { textAlign: 'center', fontSize: 12, marginTop: space.xs },
  versionBtn: { alignItems: 'center', marginTop: space.xs },
  devHint: { fontSize: 12, marginTop: space.xxs },
  dialogInput: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: space.sm,
    fontSize: 15,
    marginBottom: space.md,
  },
  dialogError: { fontSize: 13, marginBottom: space.xs },
  langOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: space.sm, borderBottomWidth: 1,
  },
  langOptionText: { fontSize: 15, fontWeight: '500' },
});
