import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Animated, ActivityIndicator,
  PanResponder, Keyboard, Image,
} from 'react-native';
import SafeAreaView from '../components/SafeAreaView';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import Slider from '../components/Slider';
import BottomSheet from '../components/BottomSheet';
import EmptyCard from '../components/EmptyCard';
import { SheetDragHandle } from '../components/SheetHeader';
import TimePicker from '../components/TimePicker';
import HabitDetailSheet from '../components/HabitDetailSheet';
import HabitIcon from '../components/HabitIcon';
import { lightImpact, mediumImpact } from '../utils/haptics';
import { routeLeavesTab } from '../utils/links';
import { describeSchedule, weekdayLabels, DEFAULT_SCHEDULE } from '../utils/schedule';
import { getHabitTypes, describeGoal } from '../utils/habits';
import { suggestHabit } from '../services/aiCoaching';
import { useAuth } from '../context/AuthContext';
import { t, useLocale } from '../i18n';
import { accentIdFor } from '../theme/accentNames';

// Preset icons. The stored value is the emoji; `key` names it for screen readers (habits.icons.<key>).
const ICONS = [
  { key: 'star', emoji: '⭐' }, { key: 'target', emoji: '🎯' }, { key: 'strength', emoji: '💪' },
  { key: 'brain', emoji: '🧠' }, { key: 'writing', emoji: '✍️' }, { key: 'art', emoji: '🎨' },
  { key: 'walk', emoji: '🚶' }, { key: 'bath', emoji: '🛁' }, { key: 'plant', emoji: '🌿' },
  { key: 'heart', emoji: '❤️' }, { key: 'water', emoji: '💧' }, { key: 'run', emoji: '🏃' },
  { key: 'books', emoji: '📚' }, { key: 'meditate', emoji: '🧘' }, { key: 'sleep', emoji: '😴' },
  { key: 'salad', emoji: '🥗' }, { key: 'apple', emoji: '🍎' }, { key: 'coffee', emoji: '☕' },
  { key: 'music', emoji: '🎵' }, { key: 'sunrise', emoji: '🌅' },
];
const BLANK = { name: '', icon: '⭐', type: 'daily', volumeGoal: 3, customIconUri: null, schedule: DEFAULT_SCHEDULE, color: null, timeOfDay: 'anytime', unit: '', intention: '' };

// Per-habit accent colours (null = theme primary). Chosen to read on light and dark.
const HABIT_COLORS = [null, '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#A855F7', '#EC4899'];
const TIME_OPTIONS = ['anytime', 'morning', 'afternoon', 'evening'];

const SCHEDULE_OPTIONS = [
  { type: 'daily', key: 'scheduleDaily' },
  { type: 'weekdays', key: 'scheduleWeekdays' },
  { type: 'perWeek', key: 'schedulePerWeek' },
];
// Monday-first display order; values are JS weekday numbers (0 = Sunday).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Schedule section of the habit form: pick a pattern, then its details.
function SchedulePicker({ schedule, onChange, theme }) {
  const type = schedule?.type ?? 'daily';
  const days = schedule?.days ?? [1, 2, 3, 4, 5];
  const target = schedule?.target ?? 3;

  const select = (t) => {
    if (t === 'daily') onChange({ type: 'daily' });
    else if (t === 'weekdays') onChange({ type: 'weekdays', days: type === 'weekdays' ? days : [1, 2, 3, 4, 5] });
    else onChange({ type: 'perWeek', target: type === 'perWeek' ? target : 3 });
  };

  const toggleDay = (d) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
    if (next.length === 0) return; // keep at least one day; "none" is not a schedule
    onChange({ type: 'weekdays', days: next });
  };

  const dayLabels = weekdayLabels();
  return (
    <>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.schedule')}</Text>
      <View style={styles.typeRow}>
        {SCHEDULE_OPTIONS.map(opt => {
          const active = type === opt.type;
          return (
            <TouchableOpacity
              key={opt.type}
              style={[styles.scheduleBtn, { borderColor: active ? theme.primary : theme.border }, active && { backgroundColor: theme.primaryLight }]}
              onPress={() => select(opt.type)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.scheduleBtnText, { color: active ? theme.primary : theme.textSecondary }]}>{t(`habits.form.${opt.key}`)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {type === 'weekdays' && (
        <View style={styles.dayRow}>
          {WEEKDAY_ORDER.map(d => {
            const on = days.includes(d);
            return (
              <TouchableOpacity
                key={d}
                style={[styles.dayChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : theme.bg }]}
                onPress={() => toggleDay(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={dayLabels[d]}
              >
                <Text style={[styles.dayChipText, { color: on ? '#fff' : theme.textSecondary }]}>{dayLabels[d]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {type === 'perWeek' && (
        <View style={styles.perWeekRow}>
          <Text style={[styles.perWeekText, { color: theme.text }]}>{t('habits.form.perWeekText', { count: target })}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepBtn, { borderColor: theme.border, opacity: target <= 1 ? 0.4 : 1 }]}
              onPress={() => target > 1 && onChange({ type: 'perWeek', target: target - 1 })}
              accessibilityRole="button" accessibilityLabel={t('habits.form.fewerDays')} accessibilityState={{ disabled: target <= 1 }}
            >
              <Text style={[styles.stepBtnText, { color: theme.text }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.stepValue, { color: theme.text }]}>{target}</Text>
            <TouchableOpacity
              style={[styles.stepBtn, { borderColor: theme.border, opacity: target >= 6 ? 0.4 : 1 }]}
              onPress={() => target < 6 && onChange({ type: 'perWeek', target: target + 1 })}
              accessibilityRole="button" accessibilityLabel={t('habits.form.moreDays')} accessibilityState={{ disabled: target >= 6 }}
            >
              <Text style={[styles.stepBtnText, { color: theme.text }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}
// Responder probe for the habit form: dismiss the keyboard, never claim the touch.
const dismissKeyboardOnBlankTap = () => { Keyboard.dismiss(); return false; };

const DEFAULT_REMINDER = { enabled: false, hour12: 9, minute: 0, ampm: 'AM' };

function formatReminder(reminder) {
  if (!reminder?.enabled) return null;
  const { hour12, minute, ampm } = reminder;
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

function IconPicker({ selected, onSelect, customIconUri, onCustomIcon, theme }) {
  return (
    <View style={styles.iconGrid}>
      {ICONS.map(({ key, emoji }) => {
        const active = selected === emoji && !customIconUri;
        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.iconBtn,
              { backgroundColor: theme.bg, borderColor: active ? theme.primary : theme.border },
              active && { backgroundColor: theme.primaryLight },
            ]}
            onPress={() => onSelect(emoji)}
            accessibilityRole="button"
            accessibilityLabel={t(`habits.icons.${key}`)}
            accessibilityState={{ selected: active }}
          >
            <Text style={styles.iconBtnText}>{emoji}</Text>
          </TouchableOpacity>
        );
      })}
      {/* Camera / Gallery button */}
      <TouchableOpacity
        style={[
          styles.iconBtn,
          { backgroundColor: theme.bg, borderColor: customIconUri ? theme.primary : theme.border },
          customIconUri && { backgroundColor: theme.primaryLight },
        ]}
        onPress={onCustomIcon}
        accessibilityRole="button"
        accessibilityLabel={t('habits.form.photoIcon')}
        accessibilityState={{ selected: !!customIconUri }}
      >
        {customIconUri ? (
          <Image source={{ uri: customIconUri }} style={{ width: 28, height: 28, borderRadius: 4 }} />
        ) : (
          <Ionicons name="add-outline" size={26} color={theme.textSecondary} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const VOLUME_MAX_OPTIONS = [
  { label: '10', max: 10 },
  { label: '25', max: 25 },
  { label: '100', max: 100 },
];

function HabitModal({ visible, editingId, form, setForm, onSave, onClose, theme }) {
  const translateY = useRef(new Animated.Value(700)).current;
  const [internalVisible, setInternalVisible] = useState(false);
  const [volMax, setVolMax] = useState(10);
  const { user } = useAuth();
  const { todayStr } = useApp();
  // Magic Fill: describe the habit in words, the AI fills the form.
  const [magicText, setMagicText] = useState('');
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicError, setMagicError] = useState('');
  const runMagic = async () => {
    if (magicBusy || magicText.trim().length < 3) return;
    setMagicBusy(true); setMagicError('');
    try {
      const { habit } = await suggestHabit(magicText.trim(), todayStr());
      setForm(f => ({
        ...f,
        name: habit.name || f.name,
        icon: habit.icon || f.icon,
        customIconUri: null,
        type: habit.type || 'daily',
        volumeGoal: habit.volumeGoal ?? f.volumeGoal,
        unit: habit.unit || '',
        schedule: habit.schedule || DEFAULT_SCHEDULE,
        timeOfDay: habit.timeOfDay || 'anytime',
        color: habit.color || null,
        intention: habit.intention || '',
      }));
      if (habit.type === 'volume' && habit.volumeGoal > 10) setVolMax(habit.volumeGoal > 25 ? 100 : 25);
    } catch (e) {
      setMagicError(e.message || t('habits.form.magicError'));
    } finally {
      setMagicBusy(false);
    }
  };

  const animateClose = useCallback((cb) => {
    Animated.timing(translateY, { toValue: 700, duration: 220, useNativeDriver: true }).start(() => {
      setInternalVisible(false);
      cb?.();
    });
  }, [translateY]);

  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      translateY.setValue(700);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      animateClose(null);
    }
  }, [visible, animateClose]);

  const handleVolMaxChange = (newMax) => {
    setVolMax(newMax);
    if (form.volumeGoal > newMax) setForm(f => ({ ...f, volumeGoal: newMax }));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) {
          Animated.timing(translateY, { toValue: 700, duration: 220, useNativeDriver: true }).start(() => {
            setInternalVisible(false);
            onClose();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80 }).start();
        }
      },
    })
  ).current;

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== 'granted') {
        Alert.alert(t('habits.permission.title'), t('habits.permission.body'));
        return;
      }
    }

    Alert.alert(t('habits.customIcon.title'), t('habits.customIcon.body'), [
      {
        text: t('habits.customIcon.camera'),
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
          if (!result.canceled) setForm(f => ({ ...f, customIconUri: result.assets[0].uri, icon: null }));
        },
      },
      {
        text: t('habits.customIcon.library'),
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
          if (!result.canceled) setForm(f => ({ ...f, customIconUri: result.assets[0].uri, icon: null }));
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleClose = () => animateClose(onClose);
  const habitTypes = getHabitTypes();

  return (
    <BottomSheet visible={internalVisible} onClose={handleClose} translateY={translateY} backgroundColor={theme.surface} maxHeight="90%">
          <SheetDragHandle panHandlers={panResponder.panHandlers} theme={theme} />

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>
              {editingId ? t('habits.form.editTitle') : t('habits.form.newTitle')}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.sheetCloseBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {/* Tapping blank space dismisses the keyboard. A responder (not a Touchable) keeps the
                wrapper out of the accessibility tree: a clickable wrapper made TalkBack merge every
                label in the form into one focus stop. */}
            <View onStartShouldSetResponder={dismissKeyboardOnBlankTap}>
              <View>
                {!editingId && !!user && (
                  <View style={[styles.magicBox, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
                    <Text style={[styles.magicTitle, { color: theme.primary }]}>{t('habits.form.magicTitle')}</Text>
                    <View style={styles.magicRow}>
                      <TextInput
                        style={[styles.magicInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                        placeholder={t('habits.form.magicPlaceholder')}
                        placeholderTextColor={theme.textSecondary}
                        value={magicText}
                        onChangeText={setMagicText}
                        maxLength={200}
                        returnKeyType="go"
                        onSubmitEditing={runMagic}
                        accessibilityLabel={t('habits.form.magicA11y')}
                      />
                      <TouchableOpacity
                        style={[styles.magicBtn, { backgroundColor: theme.primary, opacity: magicBusy || magicText.trim().length < 3 ? 0.5 : 1 }]}
                        onPress={runMagic}
                        disabled={magicBusy || magicText.trim().length < 3}
                        accessibilityRole="button"
                        accessibilityLabel={t('habits.form.magicFillA11y')}
                        accessibilityState={{ disabled: magicBusy, busy: magicBusy }}
                      >
                        {magicBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.magicBtnText}>{t('habits.form.fill')}</Text>}
                      </TouchableOpacity>
                    </View>
                    {!!magicError && <Text style={[styles.magicError, { color: theme.dangerText }]}>{magicError}</Text>}
                  </View>
                )}

                <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.icon')}</Text>
                <IconPicker
                  selected={form.icon}
                  onSelect={icon => setForm(f => ({ ...f, icon, customIconUri: null }))}
                  customIconUri={form.customIconUri}
                  onCustomIcon={handlePickImage}
                  theme={theme}
                />

                <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.colour')}</Text>
                <View style={styles.colorRow}>
                  {HABIT_COLORS.map(c => {
                    const active = (form.color || null) === c;
                    const accentId = accentIdFor(c);
                    return (
                      <TouchableOpacity
                        key={c || 'default'}
                        style={[styles.colorDot, { backgroundColor: c || theme.primary, borderColor: active ? theme.text : 'transparent' }]}
                        onPress={() => setForm(f => ({ ...f, color: c }))}
                        accessibilityRole="button"
                        accessibilityLabel={!c ? t('habits.form.defaultColour') : accentId ? t(`habits.colors.${accentId}`) : t('habits.form.colour')}
                        accessibilityState={{ selected: active }}
                      >
                        {active && <Text style={styles.colorCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.name')}</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
                  placeholder={t('habits.form.namePlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  value={form.name}
                  onChangeText={name => setForm(f => ({ ...f, name }))}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  accessibilityLabel={t('habits.form.name')}
                />

                <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.plan')}</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
                  placeholder={t('habits.form.planPlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  value={form.intention || ''}
                  onChangeText={intention => setForm(f => ({ ...f, intention }))}
                  maxLength={80}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  accessibilityLabel={t('habits.form.planA11y')}
                />

                <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.type')}</Text>
                <View style={styles.typeRow}>
                  {habitTypes.map(ht => {
                    const active = form.type === ht.value;
                    return (
                      <TouchableOpacity
                        key={ht.value}
                        style={[
                          styles.typeChip,
                          { borderColor: active ? theme.primary : theme.border },
                          active && { backgroundColor: theme.primaryLight },
                        ]}
                        onPress={() => setForm(f => ({
                          ...f,
                          type: ht.value,
                          volumeGoal: ht.value === 'volume' ? (f.volumeGoal >= 2 ? f.volumeGoal : 3)
                            : ht.value === 'timed' ? (f.volumeGoal >= 5 ? f.volumeGoal : 20)
                            : ht.value === 'atMost' ? (f.volumeGoal >= 1 && f.volumeGoal <= 20 ? f.volumeGoal : 2)
                            : 1,
                        }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={t('habits.form.typeA11y', { label: ht.label, hint: ht.hint })}
                      >
                        <Text style={[styles.typeBtnText, { color: active ? theme.primary : theme.textSecondary }]}>{t('habits.form.typeChip', { emoji: ht.emoji, label: ht.label })}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.typeHint, { color: theme.textSecondary }]}>{habitTypes.find(ht => ht.value === form.type)?.hint}</Text>

                <SchedulePicker
                  schedule={form.schedule}
                  onChange={schedule => setForm(f => ({ ...f, schedule }))}
                  theme={theme}
                />

                <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.timeOfDay')}</Text>
                <View style={styles.timeRow}>
                  {TIME_OPTIONS.map(opt => {
                    const active = (form.timeOfDay || 'anytime') === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.timeChip, { borderColor: active ? theme.primary : theme.border }, active && { backgroundColor: theme.primaryLight }]}
                        onPress={() => setForm(f => ({ ...f, timeOfDay: opt }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.timeChipText, { color: active ? theme.primary : theme.textSecondary }]}>{t(`timeOfDay.${opt}`)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {form.type === 'timed' && (
                  <>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.minutesPerDay', { count: form.volumeGoal })}</Text>
                    <Slider value={form.volumeGoal} min={5} max={180} onValueChange={v => setForm(f => ({ ...f, volumeGoal: Math.max(5, Math.round(v / 5) * 5) }))} theme={theme} label={t('habits.form.minutesLabel')} />
                    <View style={styles.sliderLabels}>
                      <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>{t('habits.form.fiveMin')}</Text>
                      <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>{t('habits.form.threeHours')}</Text>
                    </View>
                  </>
                )}

                {form.type === 'atMost' && (
                  <>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.atMostPerDay', { count: form.volumeGoal })}</Text>
                    <Slider value={form.volumeGoal} min={0} max={20} onValueChange={v => setForm(f => ({ ...f, volumeGoal: v }))} theme={theme} label={t('habits.form.dailyLimit')} />
                    <View style={styles.sliderLabels}>
                      <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>0</Text>
                      <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>20</Text>
                    </View>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.unit')}</Text>
                    <TextInput
                      style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
                      placeholder={t('habits.form.unitPlaceholderLimit')}
                      placeholderTextColor={theme.textSecondary}
                      value={form.unit || ''}
                      onChangeText={unit => setForm(f => ({ ...f, unit }))}
                      maxLength={20}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      accessibilityLabel={t('habits.form.unitA11y')}
                    />
                  </>
                )}

                {form.type === 'volume' && (
                  <>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.timesPerDay', { count: form.volumeGoal })}</Text>
                    <View style={styles.volMaxRow}>
                      {VOLUME_MAX_OPTIONS.map(opt => (
                        <TouchableOpacity
                          key={opt.max}
                          style={[
                            styles.volMaxBtn,
                            { borderColor: volMax === opt.max ? theme.primary : theme.border },
                            volMax === opt.max && { backgroundColor: theme.primaryLight },
                          ]}
                          onPress={() => handleVolMaxChange(opt.max)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: volMax === opt.max }}
                        >
                          <Text style={[styles.volMaxBtnText, { color: volMax === opt.max ? theme.primary : theme.textSecondary }]}>
                            {t('habits.form.max', { max: opt.label })}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Slider
                      value={form.volumeGoal}
                      min={2}
                      max={volMax}
                      onValueChange={v => setForm(f => ({ ...f, volumeGoal: v }))}
                      theme={theme}
                      label={t('habits.form.timesLabel')}
                    />
                    <View style={styles.sliderLabels}>
                      <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>2</Text>
                      <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>{volMax}</Text>
                    </View>
                    <Text style={[styles.label, { color: theme.textSecondary }]}>{t('habits.form.unit')}</Text>
                    <TextInput
                      style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
                      placeholder={t('habits.form.unitPlaceholderVolume')}
                      placeholderTextColor={theme.textSecondary}
                      value={form.unit || ''}
                      onChangeText={unit => setForm(f => ({ ...f, unit }))}
                      maxLength={20}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      accessibilityLabel={t('habits.form.unitA11y')}
                    />
                  </>
                )}
              </View>
            </View>

            {/* Save button at bottom of scroll */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: form.name.trim() ? theme.primary : theme.border, marginTop: 12 }]}
              onPress={onSave}
              disabled={!form.name.trim()}
              accessibilityRole="button"
              accessibilityState={{ disabled: !form.name.trim() }}
            >
              <Text style={styles.saveBtnText}>{editingId ? t('habits.form.saveChanges') : t('habits.form.addHabit')}</Text>
            </TouchableOpacity>
          </ScrollView>
    </BottomSheet>
  );
}

function HabitRow({ habit, theme, onEdit, onDelete, onBell, onOpen, reorder, onMove, isFirst, isLast }) {
  const reminderTime = formatReminder(habit.reminder);
  const reminderOn = habit.reminder?.enabled;
  const scheduleLabel = habit.schedule && habit.schedule.type !== 'daily' ? describeSchedule(habit.schedule) : null;
  const accent = habit.color || theme.primary;
  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {habit.color ? <View style={[styles.rowStripe, { backgroundColor: accent }]} /> : null}
      <HabitIcon habit={habit} size={26} imageStyle={styles.rowIconImage} textStyle={styles.rowIcon} />
      <TouchableOpacity style={styles.rowInfo} onPress={onOpen} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={t('habits.row.detailsA11y', { name: habit.name })}>
        <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{habit.name}</Text>
        <View style={styles.rowMeta}>
          <View style={[styles.typePill, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.typePillText, { color: theme.primary }]}>
              {describeGoal(habit)}
            </Text>
          </View>
          {habit.timeOfDay && habit.timeOfDay !== 'anytime' && (
            <View style={[styles.typePill, { backgroundColor: theme.primaryLight }]}>
              <Text style={[styles.typePillText, { color: theme.primary }]}>{t(`timeOfDay.${habit.timeOfDay}`)}</Text>
            </View>
          )}
          {scheduleLabel && (
            <View style={[styles.typePill, { backgroundColor: theme.primaryLight }]}>
              <Text style={[styles.typePillText, { color: theme.primary }]}>{t('habits.row.schedulePill', { schedule: scheduleLabel })}</Text>
            </View>
          )}
          {reminderTime && (
            <View style={[styles.reminderPill, { backgroundColor: theme.primaryLight }]}>
              <Text style={[styles.reminderPillText, { color: theme.primary }]}>{t('habits.row.reminderPill', { time: reminderTime })}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      {reorder ? (
        <>
          <TouchableOpacity style={[styles.moveBtn, { borderColor: theme.border, opacity: isFirst ? 0.3 : 1 }]} onPress={() => !isFirst && onMove(-1)} accessibilityRole="button" accessibilityLabel={t('habits.row.moveUp')}>
            <Ionicons name="chevron-up" size={18} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.moveBtn, { borderColor: theme.border, opacity: isLast ? 0.3 : 1 }]} onPress={() => !isLast && onMove(1)} accessibilityRole="button" accessibilityLabel={t('habits.row.moveDown')}>
            <Ionicons name="chevron-down" size={18} color={theme.text} />
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.bellBtn} onPress={onBell} accessibilityRole="button" accessibilityLabel={reminderOn ? t('habits.row.reminderOff') : t('habits.row.setReminder')}>
            <Ionicons
              name={reminderOn ? 'notifications' : 'notifications-outline'}
              size={20}
              color={reminderOn ? theme.primary : theme.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={onEdit} accessibilityRole="button" accessibilityLabel={t('habits.row.editA11y')}>
            <Text style={[styles.editBtnText, { color: theme.textSecondary }]}>{t('common.edit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} accessibilityRole="button" accessibilityLabel={t('habits.row.archiveA11y')}>
            <Ionicons name="archive-outline" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function ArchivedRow({ habit, theme, onRestore, onDelete }) {
  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border, opacity: 0.75 }]}>
      <Text style={styles.rowIcon}>{habit.icon ?? '📦'}</Text>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: theme.textSecondary }]} numberOfLines={1}>{habit.name}</Text>
      </View>
      <TouchableOpacity style={styles.editBtn} onPress={onRestore} accessibilityRole="button" accessibilityLabel={t('habits.row.restoreA11y')}>
        <Text style={[styles.editBtnText, { color: theme.primary }]}>{t('habits.row.restore')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} accessibilityRole="button" accessibilityLabel={t('habits.row.deleteForeverA11y')}>
        <Ionicons name="trash-outline" size={18} color={theme.dangerText} />
      </TouchableOpacity>
    </View>
  );
}

export default function HabitsScreen() {
  const {
    habits, archivedHabits, addHabit, updateHabit, deleteHabit, archiveHabit, unarchiveHabit, moveHabit, theme,
    pendingHabitLinkChallenge, setPendingHabitLinkChallenge, linkHabitToChallenge, ensureNotificationPermission,
    pendingRoute, clearPendingRoute, canAddHabit,
    setModalOpen, settings,
  } = useApp();
  useLocale();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [reminderTarget, setReminderTarget] = useState(null);
  const [detailHabit, setDetailHabit] = useState(null);
  const [reorder, setReorder] = useState(false);

  // Track modal open for swipe lock
  useEffect(() => { setModalOpen(modalVisible || !!reminderTarget || !!detailHabit); }, [modalVisible, reminderTarget, detailHabit]);

  // Deep links: groov://habit/<id> opens the detail sheet, groov://habits/new the form.
  useEffect(() => {
    // A tab-less route (groov://dev/design) is not for this screen: leave it and any open sheet.
    if (!pendingRoute || pendingRoute.tab == null) return;
    if (routeLeavesTab(pendingRoute, 3)) {
      // Leaving this tab by link: drop any open sheet so it does not cover the target.
      setDetailHabit(null); setModalVisible(false); setReminderTarget(null);
      clearPendingRoute();
      return;
    }
    const t = setTimeout(() => {
      if (pendingRoute.action === 'new') { setEditingId(null); setForm(BLANK); setModalVisible(true); }
      else if (pendingRoute.action === 'open') {
        const h = habits.find(x => x.id === pendingRoute.habitId);
        if (h) setDetailHabit(h);
      }
      clearPendingRoute();
    }, 350);
    return () => clearTimeout(t);
  }, [pendingRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open Add Habit modal when navigated here from Challenge with a pending link
  useEffect(() => {
    if (pendingHabitLinkChallenge) {
      const t = setTimeout(() => {
        setEditingId(null);
        setForm(BLANK);
        setModalVisible(true);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [pendingHabitLinkChallenge]);

  const openAdd = () => {
    if (settings.hapticsEnabled) lightImpact();
    if (!canAddHabit()) return;
    setEditingId(null);
    setForm(BLANK);
    setModalVisible(true);
  };

  const openEdit = (habit) => {
    setEditingId(habit.id);
    setForm({
      name: habit.name, icon: habit.icon, type: habit.type, volumeGoal: habit.volumeGoal, customIconUri: habit.customIconUri ?? null,
      schedule: habit.schedule ?? DEFAULT_SCHEDULE, color: habit.color ?? null, timeOfDay: habit.timeOfDay ?? 'anytime', unit: habit.unit ?? '',
      intention: habit.intention ?? '',
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (settings.hapticsEnabled) mediumImpact();
    const habit = {
      ...form,
      name: form.name.trim(),
      unit: form.type === 'volume' || form.type === 'atMost' ? (form.unit || '').trim() || null : null,
      intention: (form.intention || '').trim() || null,
      volumeGoal: form.type === 'daily' || form.type === 'quit' ? 1
        : form.type === 'atMost' ? Math.max(0, Number(form.volumeGoal) || 0)
        : Math.max(1, Number(form.volumeGoal) || 1),
    };
    if (editingId) {
      updateHabit(editingId, habit);
    } else {
      const newId = addHabit(habit);
      // If we came from Challenge screen, link this new habit to that challenge
      if (pendingHabitLinkChallenge && newId) {
        linkHabitToChallenge(pendingHabitLinkChallenge, newId);
        setPendingHabitLinkChallenge(null);
      }
    }
    setModalVisible(false);
  };

  // Archive is the default; permanent deletion is one more step away.
  const handleDelete = (id, name) => {
    if (settings.hapticsEnabled) lightImpact();
    Alert.alert(t('habits.archive.title'), t('habits.archive.body', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('habits.archive.deleteForever'), style: 'destructive', onPress: () => handleDeleteForever(id, name) },
      { text: t('habits.archive.archive'), onPress: () => archiveHabit(id) },
    ]);
  };

  const handleDeleteForever = (id, name) => {
    Alert.alert(t('habits.deleteHabit.title'), t('habits.deleteHabit.body', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteHabit(id) },
    ]);
  };

  // habit.reminder is the single source of truth; AppContext reschedules the OS
  // notifications whenever it changes, and Settings lists it from the habit itself.
  const handleReminderSave = (habitId, reminderData) => {
    updateHabit(habitId, { reminder: { hour12: reminderData.hour12, minute: reminderData.minute, ampm: reminderData.ampm, enabled: true } });
    setReminderTarget(null);
  };

  const handleReminderToggleOff = (habit) => {
    updateHabit(habit.id, { reminder: { ...habit.reminder, enabled: false } });
  };

  const targetHabit = reminderTarget ? habits.find(h => h.id === reminderTarget) : null;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={[styles.heading, { color: theme.text }]}>{t('habits.title')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {habits.length > 1 && (
              <TouchableOpacity
                style={[styles.reorderBtn, { borderColor: reorder ? theme.primary : theme.border, backgroundColor: reorder ? theme.primaryLight : 'transparent' }]}
                onPress={() => { if (settings.hapticsEnabled) lightImpact(); setReorder(r => !r); }}
                accessibilityRole="button"
                accessibilityState={{ selected: reorder }}
                accessibilityLabel={reorder ? t('habits.finishReorder') : t('habits.reorder')}
              >
                <Ionicons name={reorder ? 'checkmark' : 'swap-vertical'} size={18} color={reorder ? theme.primary : theme.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.primary }]} onPress={openAdd} accessibilityRole="button" accessibilityLabel={t('habits.addA11y')}>
              <Text style={styles.addBtnText}>{t('habits.add')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {habits.length === 0 ? (
          <EmptyCard
            emoji="📋"
            title={t('habits.empty.title')}
            body={t('habits.empty.body')}
            theme={theme}
            titleColor={theme.textSecondary}
            style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}
          />
        ) : (
          habits.map((habit, i) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              theme={theme}
              reorder={reorder}
              isFirst={i === 0}
              isLast={i === habits.length - 1}
              onMove={(d) => { if (settings.hapticsEnabled) lightImpact(); moveHabit(habit.id, d); }}
              onEdit={() => openEdit(habit)}
              onOpen={() => { if (settings.hapticsEnabled) lightImpact(); setDetailHabit(habit); }}
              onDelete={() => handleDelete(habit.id, habit.name)}
              onBell={async () => {
                lightImpact();
                if (habit.reminder?.enabled) { handleReminderToggleOff(habit); return; }
                if (await ensureNotificationPermission()) setReminderTarget(habit.id);
              }}
            />
          ))
        )}

        {archivedHabits.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{t('habits.archived', { count: archivedHabits.length })}</Text>
            {archivedHabits.map(habit => (
              <ArchivedRow
                key={habit.id}
                habit={habit}
                theme={theme}
                onRestore={() => { if (settings.hapticsEnabled) lightImpact(); unarchiveHabit(habit.id); }}
                onDelete={() => handleDeleteForever(habit.id, habit.name)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <HabitDetailSheet
        habit={detailHabit ? habits.find(h => h.id === detailHabit.id) || null : null}
        onClose={() => setDetailHabit(null)}
        onEdit={openEdit}
      />

      <HabitModal
        visible={modalVisible}
        editingId={editingId}
        form={form}
        setForm={setForm}
        onSave={handleSave}
        onClose={() => {
          setModalVisible(false);
          setPendingHabitLinkChallenge(null); // cancel link if user dismisses
        }}
        theme={theme}
      />

      {targetHabit && (() => {
        let hour12, minute, ampm;
        if (targetHabit.reminder?.enabled) {
          ({ hour12, minute, ampm } = targetHabit.reminder);
        } else {
          const now = new Date();
          const h24 = now.getHours();
          hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
          minute = now.getMinutes();
          ampm = h24 >= 12 ? 'PM' : 'AM';
        }
        return (
          <TimePicker
            visible={true}
            hour12={hour12}
            minute={minute}
            ampm={ampm}
            onClose={() => setReminderTarget(null)}
            onSave={(t) => handleReminderSave(targetHabit.id, t)}
            theme={theme}
          />
        );
      })()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heading: { fontSize: 28, fontWeight: 'bold' },
  addBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  reorderBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1,
    padding: 14, marginBottom: 10, overflow: 'hidden',
  },
  rowStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  moveBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  colorCheck: { color: '#fff', fontWeight: '800', fontSize: 14 },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  timeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  timeChipText: { fontSize: 13, fontWeight: '600' },
  rowIcon: { fontSize: 26, marginRight: 12 },
  rowIconImage: { width: 32, height: 32, borderRadius: 6, marginRight: 12 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowMeta: { flexDirection: 'row', marginTop: 4, gap: 6, flexWrap: 'wrap' },
  typePill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typePillText: { fontSize: 12, fontWeight: '600' },
  reminderPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  reminderPillText: { fontSize: 12, fontWeight: '600' },
  bellBtn: { padding: 6, marginRight: 2 },
  editBtn: { padding: 6, marginRight: 4 },
  editBtnText: { fontSize: 13, fontWeight: '600' },
  deleteBtn: { padding: 6 },
  empty: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 16,
    padding: 36, alignItems: 'center', marginTop: 24,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center' },
  addHabitBtn: {
    alignSelf: 'center',
    marginTop: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold' },
  sheetCloseBtn: { padding: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  magicBox: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 20 },
  magicTitle: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  magicRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  magicInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  magicBtn: { paddingHorizontal: 16, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minWidth: 60 },
  magicBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  magicError: { fontSize: 12, marginTop: 6 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  iconBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 22 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 20 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typeChip: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5 },
  typeHint: { fontSize: 12, marginBottom: 20 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  typeBtnText: { fontSize: 14, fontWeight: '600' },
  scheduleBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  scheduleBtnText: { fontSize: 13, fontWeight: '600' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  dayChip: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dayChipText: { fontSize: 13, fontWeight: '700' },
  perWeekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  perWeekText: { fontSize: 14, flex: 1, marginRight: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 18, fontWeight: '600' },
  stepValue: { fontSize: 18, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  volMaxRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  volMaxBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  volMaxBtnText: { fontSize: 12, fontWeight: '700' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  sliderLabelText: { fontSize: 11 },
  saveBtn: { marginTop: 12, padding: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
