import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert, Platform, TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import TimePicker from '../components/TimePicker';
import { sendTestNotification } from '../utils/notifications';
import { lightImpact } from '../utils/haptics';
import { playSuccessChime } from '../utils/sounds';
import { to12h, to24h, formatTime12 as formatTime } from '../utils/time';

// Secret code for first-time dev unlock (tap version label 7× then enter)
const DEV_CODE = 'devmode';

// "v1.2.0 (7)": app version from app.json, native build number from the binary.
const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const BUILD_NUMBER = Application.nativeBuildVersion;
const VERSION_LABEL = `Groov v${APP_VERSION}${BUILD_NUMBER ? ` (${BUILD_NUMBER})` : ''}`;

// Static site in site/, deployed by Cloudflare Pages at isaaceast.com/groov.
const SITE_URL = 'https://isaaceast.com/groov';
const PRIVACY_URL = `${SITE_URL}/privacy-policy`;
const TERMS_URL = `${SITE_URL}/terms`;

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
];


function Row({ label, sublabel, right, theme, onPress }) {
  const content = (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSub, { color: theme.textMuted }]}>{sublabel}</Text>}
      </View>
      <View style={styles.rowRight}>{right}</View>
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
  }
  return content;
}

// One reminder entry: label (editable for global reminders), enabled switch, time + remove.
function ReminderBlock({ theme, label, icon, badge, sublabel, enabled, masterOn, time, onToggle, onTime, onRemove, editing, labelDraft, onLabelDraft, onLabelSave, onStartEdit }) {
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
          />
        ) : (
          <TouchableOpacity onPress={onStartEdit} style={{ flex: 1 }} activeOpacity={onStartEdit ? 0.7 : 1}>
            <View style={styles.reminderLabelInner}>
              {!!icon && <Text style={styles.habitReminderIcon}>{icon}</Text>}
              <Text style={[styles.reminderLabel, { color: theme.text }]}>{label}</Text>
              {!!badge && (
                <View style={[styles.habitBadge, { backgroundColor: theme.primaryLight }]}>
                  <Text style={[styles.habitBadgeText, { color: theme.primary }]}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.reminderSublabel, { color: theme.textMuted }]}>
              {!masterOn ? 'Notifications disabled' : sublabel ?? `Fires at ${formatTime(time)}`}
            </Text>
          </TouchableOpacity>
        )}
        <Switch
          value={enabled && masterOn}
          onValueChange={() => masterOn && onToggle()}
          trackColor={{ false: theme.border, true: theme.primary }}
          thumbColor="#fff"
          style={{ opacity: masterOn ? 1 : 0.4 }}
        />
      </View>
      <View style={styles.reminderActionsRow}>
        <TouchableOpacity
          style={[styles.timeBtn, { borderColor: theme.border, opacity: masterOn && enabled ? 1 : 0.4 }]}
          onPress={() => masterOn && enabled && onTime()}
        >
          <Text style={[styles.timeBtnText, { color: theme.primary }]}>{formatTime(time)}</Text>
        </TouchableOpacity>
        {onRemove && (
          <TouchableOpacity style={styles.deleteReminderBtn} onPress={onRemove}>
            <Ionicons name="trash-outline" size={18} color={theme.danger} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Section({ title, children, theme }) {
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings, theme, resetAll, dateOffset, setDateOffset, habits, updateHabit, pushAllData, seedRandomHistory, devMode, setDevMode } = useApp();
  const { user, signOut, displayName, updateDisplayName, deleteAccount, sendPasswordReset, verifyPasswordReset, authProvider } = useAuth();
  // Apple/Google accounts have no Groov password to reset.
  const canResetPassword = authProvider === 'email';

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          try { await pushAllData(); } catch (e) {}
          signOut();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data including habits, progress, challenges, and settings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Your account will be permanently deleted. You will not be able to recover it.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                    } catch (e) {
                      Alert.alert('Error', e.message || 'Failed to delete account. Please try again.');
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
      'Reset Password',
      `A password reset code will be sent to ${user?.email ?? 'your email'}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Code',
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
              Alert.alert('Error', e.message || 'Failed to send reset email.');
            } finally {
              setResetLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleVerifyReset = async () => {
    if (!resetCode.trim()) { setResetError('Enter the code from your email.'); return; }
    if (!resetNewPassword) { setResetError('Enter a new password.'); return; }
    if (resetNewPassword.length < 8) { setResetError('Password must be at least 8 characters.'); return; }
    if (resetNewPassword !== resetConfirmPassword) { setResetError('Passwords do not match.'); return; }
    setResetLoading(true);
    setResetError('');
    try {
      await verifyPasswordReset(user?.email ?? '', resetCode, resetNewPassword);
      setResetStep(null);
      Alert.alert('Success', 'Your password has been updated.');
    } catch (e) {
      setResetError(e.message || 'Invalid or expired code. Please try again.');
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
  const openNameEditor = () => { setNameDraft(displayName ?? ''); setNameModal(true); };
  const saveName = async () => {
    const next = nameDraft.trim();
    if (next === (displayName ?? '')) { setNameModal(false); return; }
    setNameSaving(true);
    try {
      await updateDisplayName(next);
      setNameModal(false);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update your name. Please try again.');
    } finally {
      setNameSaving(false);
    }
  };

  // Dev tools — unlocked per device; state lives in AppContext (persisted via SecureStore)
  const [devTapCount, setDevTapCount] = useState(0);
  const [showDevInput, setShowDevInput] = useState(false);
  const [devCodeDraft, setDevCodeDraft] = useState('');
  const devTapTimer = useRef(null);
  const showDevTools = devMode;
  // Throws during render so the root ErrorBoundary (and Sentry, when configured) can be exercised.
  const [crashTest, setCrashTest] = useState(false);
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
      setShowDevInput(false);
      setDevCodeDraft('');
      lightImpact();
      Alert.alert('Developer Mode', 'Dev tools unlocked on this device permanently.');
    } else {
      Alert.alert('Invalid Code', 'That code is incorrect.');
      setDevCodeDraft('');
    }
  };

  // Global reminders live in settings.reminders; per-habit reminders live on the habit.
  // AppContext reschedules the OS notifications whenever either changes.
  const reminders = settings.reminders || [];
  const habitReminders = habits.filter(h => h.reminder && h.reminder.hour12 !== undefined);
  const masterOn = settings.notificationsEnabled;

  const updateReminders = (newReminders) => updateSettings({ reminders: newReminders });

  const toggleReminderEnabled = (idx) =>
    updateReminders(reminders.map((r, i) => i === idx ? { ...r, enabled: !r.enabled } : r));

  const updateReminderTime = (idx, time) =>
    updateReminders(reminders.map((r, i) => i === idx ? { ...r, time } : r));

  const removeReminder = (idx) => {
    if (settings.hapticsEnabled) lightImpact();
    Alert.alert('Remove Reminder', 'Delete this reminder?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => updateReminders(reminders.filter((_, i) => i !== idx)) },
    ]);
  };

  const addReminder = () => {
    if (settings.hapticsEnabled) lightImpact();
    updateReminders([
      ...reminders,
      { id: `r-${Date.now()}`, label: 'Reminder', time: { hour12: 12, minute: 0, ampm: 'PM' }, enabled: true },
    ]);
  };

  const toggleHabitReminder = (habit) =>
    updateHabit(habit.id, { reminder: { ...habit.reminder, enabled: !habit.reminder.enabled } });

  const updateHabitReminderTime = (habit, t) =>
    updateHabit(habit.id, { reminder: { ...habit.reminder, hour12: t.hour12, minute: t.minute, ampm: t.ampm, enabled: true } });

  const removeHabitReminder = (habit) => {
    if (settings.hapticsEnabled) lightImpact();
    Alert.alert('Remove Reminder', `Turn off the reminder for "${habit.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => updateHabit(habit.id, { reminder: { ...habit.reminder, enabled: false } }) },
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
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all habits, progress, challenges, and settings. The app will reset completely.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            await resetAll();
            Alert.alert('Done', 'All data cleared. The app has been reset.');
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
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  })();

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heading, { color: theme.text }]}>Settings</Text>

        {/* Appearance */}
        <Section title="APPEARANCE" theme={theme}>
          <View style={[styles.row, { borderBottomColor: 'transparent' }]}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>Theme</Text>
              <Text style={[styles.rowSub, { color: theme.textMuted }]}>
                {settings.theme === 'system' ? 'Follows your device setting' : `Always ${settings.theme}`}
              </Text>
            </View>
            <View style={[styles.segment, { borderColor: theme.border }]}>
              {THEME_OPTIONS.map(opt => {
                const active = (settings.theme ?? 'system') === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.segmentBtn, active && { backgroundColor: theme.primary }]}
                    onPress={() => updateSettings({ theme: opt.value })}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.segmentText, { color: active ? '#fff' : theme.textMuted }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Section>

        {/* Notifications */}
        <Section title="NOTIFICATIONS" theme={theme}>
          <Row
            label="Enable Notifications"
            sublabel={Platform.OS === 'web' ? 'Push notifications on device only' : 'Master toggle for all reminders'}
            theme={theme}
            right={
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={v => updateSettings({ notificationsEnabled: v })}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            }
          />

          <ReminderBlock
            theme={theme}
            icon="🌙"
            label="Smart Check-in"
            sublabel={masterOn ? `Fires at ${formatTime(eveningTime)} only if habits are still unfinished` : undefined}
            enabled={!!settings.eveningReminderEnabled}
            masterOn={masterOn}
            time={eveningTime}
            onToggle={() => updateSettings({ eveningReminderEnabled: !settings.eveningReminderEnabled })}
            onTime={() => setTimeModal({ kind: 'evening' })}
          />

          {reminders.map((r, i) => (
            <ReminderBlock
              key={r.id ?? i}
              theme={theme}
              label={r.label}
              enabled={r.enabled}
              masterOn={masterOn}
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
              badge="Habit"
              enabled={!!h.reminder.enabled}
              masterOn={masterOn}
              time={h.reminder}
              onToggle={() => toggleHabitReminder(h)}
              onTime={() => setTimeModal({ kind: 'habit', id: h.id })}
              onRemove={() => removeHabitReminder(h)}
            />
          ))}

          <TouchableOpacity
            style={[styles.addReminderBtn, { borderColor: theme.border, opacity: masterOn ? 1 : 0.4 }]}
            onPress={() => masterOn && addReminder()}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
            <Text style={[styles.addReminderText, { color: theme.primary }]}>Add Reminder</Text>
          </TouchableOpacity>
        </Section>

        {/* Feedback */}
        <Section title="FEEDBACK" theme={theme}>
          <Row
            label="Sounds"
            sublabel="Chimes when you complete habits and challenges"
            theme={theme}
            right={
              <Switch
                value={settings.soundEnabled}
                onValueChange={v => {
                  updateSettings({ soundEnabled: v });
                  if (v) playSuccessChime();
                }}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            }
          />
          <Row
            label="Haptic Feedback"
            sublabel="Vibration on check-off (device only)"
            theme={theme}
            right={
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={v => updateSettings({ hapticsEnabled: v })}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            }
          />
        </Section>

        {/* Dev Tools — only visible in development builds after entering the code */}
        {showDevTools && (
          <Section title="DEV TOOLS" theme={theme}>
            {/* Date offset */}
            <View style={[styles.row, { borderBottomColor: theme.border }]}>
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>Simulated Date</Text>
                <Text style={[styles.rowSub, { color: theme.textMuted }]}>{formattedDevDate}</Text>
                {dateOffset !== 0 && (
                  <Text style={[styles.rowSub, { color: theme.warning }]}>
                    Offset: {dateOffset > 0 ? '+' : ''}{dateOffset} day{Math.abs(dateOffset) !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
              <View style={styles.devDayControls}>
                <TouchableOpacity style={[styles.devBtn, { borderColor: theme.border }]} onPress={() => adjustDay(-1)}>
                  <Text style={[styles.devBtnText, { color: theme.text }]}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.devBtn, { borderColor: theme.border }]}
                  onPress={() => setDateOffset(0)}
                >
                  <Text style={[styles.devBtnText, { color: theme.textMuted, fontSize: 10 }]}>NOW</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.devBtn, { borderColor: theme.border }]} onPress={() => adjustDay(1)}>
                  <Text style={[styles.devBtnText, { color: theme.text }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Simulate push notification */}
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={async () => {
                await sendTestNotification();
                Alert.alert('Sent', 'Test notification fired. Check your notification tray.');
              }}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>Send Test Notification</Text>
                <Text style={[styles.rowSub, { color: theme.textMuted }]}>Fires the evening reminder immediately</Text>
              </View>
              <Ionicons name="notifications-outline" size={20} color={theme.primary} />
            </TouchableOpacity>

            {/* Seed 30-day random history */}
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={() => {
                Alert.alert(
                  'Generate 30-Day History',
                  'This will fill the last 30 days with random completions. Existing history will be overwritten.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Generate', onPress: async () => {
                        await seedRandomHistory();
                        Alert.alert('Done', '30 days of random history added.');
                      },
                    },
                  ]
                );
              }}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>Generate 30-Day History</Text>
                <Text style={[styles.rowSub, { color: theme.textMuted }]}>Random completions for the past 30 days</Text>
              </View>
              <Ionicons name="calendar-outline" size={20} color={theme.primary} />
            </TouchableOpacity>

            {/* Crash test */}
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: theme.border }]}
              onPress={() => {
                Alert.alert('Test Crash', 'This throws a render error so you can check the crash screen and Sentry.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Crash', style: 'destructive', onPress: () => setCrashTest(true) },
                ]);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.text }]}>Test Crash</Text>
                <Text style={[styles.rowSub, { color: theme.textMuted }]}>Throws an error to exercise the crash screen</Text>
              </View>
              <Ionicons name="warning-outline" size={20} color={theme.warning} />
            </TouchableOpacity>

            {/* Lock dev tools */}
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: 'transparent' }]}
              onPress={() => {
                Alert.alert(
                  'Disable Dev Tools',
                  'This will re-lock dev tools on this device. You\'ll need to tap the version label 7 times and enter the code to unlock again.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disable', style: 'destructive', onPress: () => setDevMode(false),
                    },
                  ]
                );
              }}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.rowLabel, { color: theme.danger }]}>Disable Dev Tools</Text>
                <Text style={[styles.rowSub, { color: theme.textMuted }]}>Re-locks dev tools on this device</Text>
              </View>
              <Ionicons name="lock-closed-outline" size={20} color={theme.danger} />
            </TouchableOpacity>
          </Section>
        )}

        {/* Account */}
        <Section title="ACCOUNT" theme={theme}>
          <Row
            label="Display Name"
            sublabel={displayName || 'Add a name for greetings and coaching'}
            theme={theme}
            onPress={openNameEditor}
            right={<Ionicons name="create-outline" size={18} color={theme.textMuted} />}
          />
          <Row
            label="Signed in as"
            sublabel={user?.email ?? ''}
            theme={theme}
            right={null}
          />
          <TouchableOpacity
            style={[styles.dangerRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
            onPress={handleSignOut}
          >
            <Text style={styles.dangerText}>Sign Out</Text>
          </TouchableOpacity>
        </Section>

        {/* Data */}
        <Section title="DATA" theme={theme}>
          {canResetPassword && (
            <TouchableOpacity
              style={[styles.dangerRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
              onPress={handleResetPassword}
              disabled={resetLoading}
            >
              <Text style={[styles.dangerText, { color: theme.primary }]}>Reset Password</Text>
              <Text style={[styles.dangerSub, { color: theme.textMuted }]}>
                Send a reset code to your email
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.dangerRow, { borderBottomWidth: 1, borderBottomColor: theme.border }]}
            onPress={handleClearData}
          >
            <Text style={styles.dangerText}>Clear All Data</Text>
            <Text style={[styles.dangerSub, { color: theme.textMuted }]}>
              Permanently removes all habits, progress, and settings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteAccount}>
            <Text style={styles.dangerText}>Delete Account</Text>
            <Text style={[styles.dangerSub, { color: theme.textMuted }]}>
              Permanently removes your account and all data
            </Text>
          </TouchableOpacity>
        </Section>

        {/* About */}
        <Section title="ABOUT" theme={theme}>
          <Row
            label="Privacy Policy"
            sublabel="What Groov collects and why"
            theme={theme}
            onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
            right={<Ionicons name="open-outline" size={18} color={theme.textMuted} />}
          />
          <Row
            label="Terms of Use"
            theme={theme}
            onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
            right={<Ionicons name="open-outline" size={18} color={theme.textMuted} />}
          />
        </Section>

        <TouchableOpacity onPress={handleVersionTap} activeOpacity={0.7} style={styles.versionBtn}>
          <Text style={[styles.version, { color: theme.textMuted }]}>{VERSION_LABEL}</Text>
          {devTapCount > 2 && !showDevTools && (
            <Text style={[styles.devHint, { color: theme.textMuted }]}>
              {7 - devTapCount} more tap{7 - devTapCount !== 1 ? 's' : ''} to unlock dev tools
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Password Reset Modal */}
      {resetStep === 'verify' && (
        <View style={styles.devModal}>
          <View style={[styles.devModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.devModalTitle, { color: theme.text }]}>Reset Password</Text>
            <Text style={[styles.devModalSub, { color: theme.textMuted }]}>
              A reset code was sent to {user?.email}. Enter it below along with your new password.
            </Text>
            <TextInput
              style={[styles.devModalInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              value={resetCode}
              onChangeText={setResetCode}
              placeholder="Reset code from email"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.devModalInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              value={resetNewPassword}
              onChangeText={setResetNewPassword}
              placeholder="New password"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
            />
            <TextInput
              style={[styles.devModalInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text, marginBottom: 4 }]}
              value={resetConfirmPassword}
              onChangeText={setResetConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
            />
            {!!resetError && (
              <Text style={[styles.devModalSub, { color: theme.danger, marginBottom: 8 }]}>{resetError}</Text>
            )}
            <View style={styles.devModalBtns}>
              <TouchableOpacity
                style={[styles.devModalBtn, { borderColor: theme.border }]}
                onPress={() => { setResetStep(null); setResetError(''); }}
                disabled={resetLoading}
              >
                <Text style={[styles.devModalBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devModalBtn, { backgroundColor: theme.primary, borderColor: theme.primary, opacity: resetLoading ? 0.6 : 1 }]}
                onPress={handleVerifyReset}
                disabled={resetLoading}
              >
                <Text style={[styles.devModalBtnText, { color: '#fff' }]}>
                  {resetLoading ? 'Saving…' : 'Set Password'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Display name modal */}
      {nameModal && (
        <View style={styles.devModal}>
          <View style={[styles.devModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.devModalTitle, { color: theme.text }]}>Display Name</Text>
            <Text style={[styles.devModalSub, { color: theme.textMuted }]}>Used in greetings and by the AI coach.</Text>
            <TextInput
              style={[styles.devModalInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Your name"
              placeholderTextColor={theme.textMuted}
              autoFocus
              maxLength={40}
              onSubmitEditing={saveName}
              returnKeyType="done"
            />
            <View style={styles.devModalBtns}>
              <TouchableOpacity
                style={[styles.devModalBtn, { borderColor: theme.border }]}
                onPress={() => setNameModal(false)}
                disabled={nameSaving}
              >
                <Text style={[styles.devModalBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devModalBtn, { backgroundColor: theme.primary, borderColor: theme.primary, opacity: nameSaving ? 0.6 : 1 }]}
                onPress={saveName}
                disabled={nameSaving}
              >
                <Text style={[styles.devModalBtnText, { color: '#fff' }]}>{nameSaving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Dev code entry modal */}
      {showDevInput && (
        <View style={styles.devModal}>
          <View style={[styles.devModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.devModalTitle, { color: theme.text }]}>Developer Access</Text>
            <Text style={[styles.devModalSub, { color: theme.textMuted }]}>Enter the developer code</Text>
            <TextInput
              style={[styles.devModalInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              value={devCodeDraft}
              onChangeText={setDevCodeDraft}
              placeholder="Enter code"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              autoFocus
              onSubmitEditing={handleDevCodeSubmit}
              returnKeyType="done"
            />
            <View style={styles.devModalBtns}>
              <TouchableOpacity
                style={[styles.devModalBtn, { borderColor: theme.border }]}
                onPress={() => { setShowDevInput(false); setDevCodeDraft(''); }}
              >
                <Text style={[styles.devModalBtnText, { color: theme.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devModalBtn, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                onPress={handleDevCodeSubmit}
              >
                <Text style={[styles.devModalBtnText, { color: '#fff' }]}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

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
  scroll: { padding: 24, paddingBottom: 48 },
  heading: { fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
  section: { borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowRight: { marginLeft: 12 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginLeft: 12 },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 7 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  reminderBlock: {
    borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  reminderLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  reminderLabelInner: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  habitReminderIcon: { fontSize: 16 },
  habitBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  habitBadgeText: { fontSize: 11, fontWeight: '700' },
  labelInput: {
    flex: 1, fontSize: 15, fontWeight: '500', borderBottomWidth: 1,
    paddingVertical: 2, marginRight: 8,
  },
  reminderLabel: { fontSize: 15, fontWeight: '500' },
  reminderSublabel: { fontSize: 12, marginTop: 2 },
  reminderActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, flex: 1 },
  timeBtnText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  deleteReminderBtn: { padding: 6 },
  addReminderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, margin: 12, padding: 10, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed',
  },
  addReminderText: { fontSize: 14, fontWeight: '600' },
  devDayControls: { flexDirection: 'row', gap: 6 },
  devBtn: {
    width: 36, height: 36, borderRadius: 8, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  devBtnText: { fontSize: 16, fontWeight: '700' },
  dangerRow: { paddingHorizontal: 16, paddingVertical: 14 },
  dangerText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
  dangerSub: { fontSize: 12, marginTop: 2 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 8 },
  versionBtn: { alignItems: 'center', marginTop: 8 },
  devHint: { fontSize: 11, marginTop: 4 },
  devModal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  devModalCard: {
    width: '80%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  devModalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  devModalSub: { fontSize: 13, marginBottom: 16 },
  devModalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  devModalBtns: { flexDirection: 'row', gap: 10 },
  devModalBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  devModalBtnText: { fontSize: 14, fontWeight: '600' },
});
