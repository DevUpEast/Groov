import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Animated, ActivityIndicator,
  PanResponder, Keyboard, Image, useWindowDimensions,
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
import feedback, { EVENTS } from '../services/feedback';
import { routeLeavesTab } from '../utils/links';
import { describeSchedule, weekdayLabels, DEFAULT_SCHEDULE } from '../utils/schedule';
import { getHabitTypes, describeGoal } from '../utils/habits';
import { suggestHabit } from '../services/aiCoaching';
import { useAuth } from '../context/AuthContext';
import { t, useLocale } from '../i18n';
import { ACCENT_IDS, resolveAccent, storedHexFor } from '../theme/accents';
import { SHEET_OFFSCREEN, sheetIn, sheetOut, sheetSettle, handoff } from '../theme/motion';
import { BLANK_FORM, formFromHabit, habitFromForm, pickAccent, selectedAccentId, suggestedColor } from '../utils/habitForm';
import AppText from '../components/ui/AppText';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import { hitSlopFor } from '../components/ui/PressableScale';

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
// A new custom habit starts on the sky accent (plan §2.3).
const BLANK = BLANK_FORM;
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
              style={[styles.scheduleBtn, { borderColor: active ? theme.selectionBorder : theme.controlBorder }, active && { backgroundColor: theme.selection }]}
              onPress={() => select(opt.type)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.scheduleBtnText, { color: active ? theme.onSelection : theme.textSecondary }]}>{t(`habits.form.${opt.key}`)}</Text>
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
                style={[styles.dayChip, { borderColor: on ? theme.selectionBorder : theme.controlBorder, backgroundColor: on ? theme.selection : theme.bg }]}
                onPress={() => toggleDay(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={dayLabels[d]}
              >
                <Text style={[styles.dayChipText, { color: on ? theme.onSelection : theme.textSecondary }]}>{dayLabels[d]}</Text>
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

// The form content is the window width minus the sheet's 24 px side padding (VIS-15): the
// icon grid picks as many >= 44 px columns as fit and stretches them to fill the row.
const FORM_GUTTER = 24;
const ICON_GAP = 8;
const ICON_MIN = 44;
function useIconTile() {
  const { width } = useWindowDimensions();
  const inner = Math.max(ICON_MIN * 5, width - FORM_GUTTER * 2);
  const cols = Math.max(5, Math.floor((inner + ICON_GAP) / (ICON_MIN + ICON_GAP)));
  return Math.floor((inner - ICON_GAP * (cols - 1)) / cols);
}

function IconPicker({ selected, onSelect, customIconUri, onCustomIcon, theme }) {
  const tile = useIconTile();
  const size = { width: tile, height: tile };
  return (
    <View style={styles.iconGrid}>
      {ICONS.map(({ key, emoji }) => {
        const active = selected === emoji && !customIconUri;
        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.iconBtn, size,
              { backgroundColor: theme.bg, borderColor: active ? theme.selectionBorder : theme.border },
              active && { backgroundColor: theme.selection },
            ]}
            onPress={() => onSelect(emoji)}
            accessibilityRole="button"
            accessibilityLabel={t(`habits.icons.${key}`)}
            accessibilityState={{ selected: active }}
            aria-selected={active}
          >
            <Text style={styles.iconBtnText}>{emoji}</Text>
          </TouchableOpacity>
        );
      })}
      {/* Camera / Gallery button */}
      <TouchableOpacity
        style={[
          styles.iconBtn, size,
          { backgroundColor: theme.bg, borderColor: customIconUri ? theme.selectionBorder : theme.border },
          customIconUri && { backgroundColor: theme.selection },
        ]}
        onPress={onCustomIcon}
        accessibilityRole="button"
        accessibilityLabel={t('habits.form.photoIcon')}
        accessibilityState={{ selected: !!customIconUri }}
        aria-selected={!!customIconUri}
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
  const translateY = useRef(new Animated.Value(SHEET_OFFSCREEN)).current;
  const [internalVisible, setInternalVisible] = useState(false);
  const [volMax, setVolMax] = useState(10);
  const { user } = useAuth();
  const { todayStr, themeName } = useApp();
  const selectedId = selectedAccentId(form);
  // Magic Fill: describe the habit in words, the AI fills the form.
  const [magicText, setMagicText] = useState('');
  const [magicBusy, setMagicBusy] = useState(false);
  const magicTooShort = !magicBusy && magicText.trim().length < 3;
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
        color: suggestedColor(habit.color, f.color),
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
    sheetOut(translateY).start(() => {
      setInternalVisible(false);
      cb?.();
    });
  }, [translateY]);

  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      translateY.setValue(SHEET_OFFSCREEN);
      sheetIn(translateY).start();
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
          sheetOut(translateY).start(() => {
            setInternalVisible(false);
            onClose();
          });
        } else {
          sheetSettle(translateY).start();
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
    <BottomSheet visible={internalVisible} onClose={handleClose} translateY={translateY} maxHeight="90%">
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
                  <View style={[styles.magicBox, { backgroundColor: theme.brandSurface, borderColor: theme.border }]}>
                    <Text style={[styles.magicTitle, { color: theme.link }]}>{t('habits.form.magicTitle')}</Text>
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
                      {/* Too short to fill: the disabled pair (F-02 S2); busy keeps the action fill with a spinner. */}
                      <TouchableOpacity
                        style={[styles.magicBtn, { backgroundColor: magicTooShort ? theme.disabledContainer : theme.action }]}
                        onPress={runMagic}
                        disabled={magicBusy || magicTooShort}
                        accessibilityRole="button"
                        accessibilityLabel={t('habits.form.magicFillA11y')}
                        accessibilityState={{ disabled: magicBusy || magicTooShort, busy: magicBusy }}
                      >
                        {magicBusy ? <ActivityIndicator color={theme.onAction} size="small" /> : <Text style={[styles.magicBtnText, { color: magicTooShort ? theme.onDisabled : theme.onAction }]}>{t('habits.form.fill')}</Text>}
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
                {/* The 7 curated accents in one row (VIS-15). The stored colour is shown as the
                    accent it resolves to; only a tap writes (the accent's light-fill hex). */}
                <View style={styles.colorRow}>
                  {ACCENT_IDS.map(accentId => {
                    const active = selectedId === accentId;
                    const swatch = resolveAccent(storedHexFor(accentId), themeName);
                    return (
                      <TouchableOpacity
                        key={accentId}
                        style={[styles.colorDot, { backgroundColor: swatch.fill, borderColor: active ? theme.text : 'transparent' }]}
                        onPress={() => setForm(f => pickAccent(f, accentId))}
                        hitSlop={4}
                        accessibilityRole="button"
                        accessibilityLabel={t(`habits.colors.${accentId}`)}
                        accessibilityState={{ selected: active }}
                        aria-selected={active}
                      >
                        {active && <Text style={[styles.colorCheck, { color: swatch.onFill }]}>✓</Text>}
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
                          { borderColor: active ? theme.selectionBorder : theme.controlBorder },
                          active && { backgroundColor: theme.selection },
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
                        <Text style={[styles.typeBtnText, { color: active ? theme.onSelection : theme.textSecondary }]}>{t('habits.form.typeChip', { emoji: ht.emoji, label: ht.label })}</Text>
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
                        style={[styles.timeChip, { borderColor: active ? theme.selectionBorder : theme.controlBorder }, active && { backgroundColor: theme.selection }]}
                        onPress={() => setForm(f => ({ ...f, timeOfDay: opt }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.timeChipText, { color: active ? theme.onSelection : theme.textSecondary }]}>{t(`timeOfDay.${opt}`)}</Text>
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
                            { borderColor: volMax === opt.max ? theme.selectionBorder : theme.controlBorder },
                            volMax === opt.max && { backgroundColor: theme.selection },
                          ]}
                          onPress={() => handleVolMaxChange(opt.max)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: volMax === opt.max }}
                        >
                          <Text style={[styles.volMaxBtnText, { color: volMax === opt.max ? theme.onSelection : theme.textSecondary }]}>
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
            {/* Disabled until the habit has a name: disabledContainer / onDisabled (6.15:1),
                still focusable, and a tap plays `refused` (Button's default onDisabledPress). */}
            <Button
              block
              label={editingId ? t('habits.form.saveChanges') : t('habits.form.addHabit')}
              onPress={onSave}
              disabled={!form.name.trim()}
              style={styles.saveBtn}
              testID="habit-form-save"
            />
          </ScrollView>
    </BottomSheet>
  );
}

function HabitRow({ habit, theme, themeName, onEdit, onDelete, onBell, onOpen, reorder, onMove, isFirst, isLast }) {
  const reminderTime = formatReminder(habit.reminder);
  const reminderOn = habit.reminder?.enabled;
  const scheduleLabel = habit.schedule && habit.schedule.type !== 'daily' ? describeSchedule(habit.schedule) : null;
  const accent = resolveAccent(habit.color, themeName);
  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.rowStripe, { backgroundColor: accent.fill }]} />
      <HabitIcon habit={habit} size={26} imageStyle={styles.rowIconImage} textStyle={styles.rowIcon} />
      <TouchableOpacity style={styles.rowInfo} onPress={onOpen} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel={t('habits.row.detailsA11y', { name: habit.name })}>
        <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{habit.name}</Text>
        <View style={styles.rowMeta}>
          <View style={[styles.typePill, { backgroundColor: theme.selection }]}>
            <Text style={[styles.typePillText, { color: theme.onSelection }]}>
              {describeGoal(habit)}
            </Text>
          </View>
          {habit.timeOfDay && habit.timeOfDay !== 'anytime' && (
            <View style={[styles.typePill, { backgroundColor: theme.selection }]}>
              <Text style={[styles.typePillText, { color: theme.onSelection }]}>{t(`timeOfDay.${habit.timeOfDay}`)}</Text>
            </View>
          )}
          {scheduleLabel && (
            <View style={[styles.typePill, { backgroundColor: theme.selection }]}>
              <Text style={[styles.typePillText, { color: theme.onSelection }]}>{t('habits.row.schedulePill', { schedule: scheduleLabel })}</Text>
            </View>
          )}
          {reminderTime && (
            <View style={[styles.reminderPill, { backgroundColor: theme.selection }]}>
              <Text style={[styles.reminderPillText, { color: theme.onSelection }]}>{t('habits.row.reminderPill', { time: reminderTime })}</Text>
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
          {/* 40 visual + hitSlop to the touch minimum; rowIconBtn spaces the targets apart. */}
          <IconButton
            icon={reminderOn ? 'notifications' : 'notifications-outline'}
            iconSize={20}
            color={reminderOn ? theme.link : undefined}
            theme={theme}
            onPress={onBell}
            accessibilityLabel={reminderOn ? t('habits.row.reminderOff') : t('habits.row.setReminder')}
          />
          <IconButton icon="create-outline" iconSize={20} theme={theme} style={styles.rowIconBtn} onPress={onEdit} accessibilityLabel={t('habits.row.editA11y')} />
          <IconButton icon="archive-outline" iconSize={20} theme={theme} style={styles.rowIconBtn} onPress={onDelete} accessibilityLabel={t('habits.row.archiveA11y')} />
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
        <Text style={[styles.editBtnText, { color: theme.link }]}>{t('habits.row.restore')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} accessibilityRole="button" accessibilityLabel={t('habits.row.deleteForeverA11y')}>
        <Ionicons name="trash-outline" size={18} color={theme.dangerText} />
      </TouchableOpacity>
    </View>
  );
}

export default function HabitsScreen() {
  const {
    habits, archivedHabits, addHabit, updateHabit, deleteHabit, archiveHabit, unarchiveHabit, moveHabit, theme, themeName,
    pendingHabitLinkChallenge, setPendingHabitLinkChallenge, linkHabitToChallenge, ensureNotificationPermission,
    pendingRoute, clearPendingRoute, canAddHabit,
    setModalOpen,
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
      } else if (pendingRoute.action === 'edit') {
        // Edit from the detail sheet on Today (C-02b): that sheet has already closed.
        const h = habits.find(x => x.id === pendingRoute.habitId);
        if (h) { setDetailHabit(null); openEdit(h); }
      }
      clearPendingRoute();
    }, handoff.afterTabChange);
    return () => clearTimeout(t);
  }, [pendingRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open Add Habit modal when navigated here from Challenge with a pending link
  useEffect(() => {
    if (pendingHabitLinkChallenge) {
      const t = setTimeout(() => {
        setEditingId(null);
        setForm(BLANK);
        setModalVisible(true);
      }, handoff.afterTabChange); // the challenge sheet has already closed (M5)
      return () => clearTimeout(t);
    }
  }, [pendingHabitLinkChallenge]);

  const openAdd = () => {
    if (!canAddHabit()) return;
    setEditingId(null);
    setForm(BLANK);
    setModalVisible(true);
  };

  const openEdit = (habit) => {
    setEditingId(habit.id);
    // form.color keeps the stored value (legacy hexes included) until the user taps a dot.
    setForm(formFromHabit(habit));
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) { feedback.play(EVENTS.refused); return; }
    const habit = habitFromForm(form);
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
    feedback.play(EVENTS.destructiveConfirm);
    Alert.alert(t('habits.archive.title'), t('habits.archive.body', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('habits.archive.deleteForever'), style: 'destructive', onPress: () => handleDeleteForever(id, name) },
      { text: t('habits.archive.archive'), onPress: () => archiveHabit(id) },
    ]);
  };

  const handleDeleteForever = (id, name) => {
    feedback.play(EVENTS.destructiveConfirm);
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
          <AppText variant="title" style={[styles.heading, { color: theme.text }]}>{t('habits.title')}</AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {habits.length > 1 && (
              <TouchableOpacity
                style={[styles.reorderBtn, { borderColor: reorder ? theme.selectionBorder : theme.controlBorder, backgroundColor: reorder ? theme.selection : 'transparent' }]}
                onPress={() => { feedback.play(EVENTS.selection); setReorder(r => !r); }}
                accessibilityRole="button"
                accessibilityState={{ selected: reorder }}
                accessibilityLabel={reorder ? t('habits.finishReorder') : t('habits.reorder')}
              >
                <Ionicons name={reorder ? 'checkmark' : 'swap-vertical'} size={18} color={reorder ? theme.onSelection : theme.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.action }]} onPress={openAdd} accessibilityRole="button" accessibilityLabel={t('habits.addA11y')}>
              <Text style={[styles.addBtnText, { color: theme.onAction }]}>{t('habits.add')}</Text>
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
              themeName={themeName}
              reorder={reorder}
              isFirst={i === 0}
              isLast={i === habits.length - 1}
              onMove={(d) => { feedback.play(EVENTS.selection); moveHabit(habit.id, d); }}
              onEdit={() => openEdit(habit)}
              onOpen={() => setDetailHabit(habit)}
              onDelete={() => handleDelete(habit.id, habit.name)}
              onBell={async () => {
                if (habit.reminder?.enabled) { feedback.toggled(false); handleReminderToggleOff(habit); return; }
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
                onRestore={() => unarchiveHabit(habit.id)}
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
  heading: {},
  addBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { fontWeight: '700', fontSize: 15 },
  reorderBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1,
    padding: 14, marginBottom: 10, overflow: 'hidden',
  },
  rowStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  moveBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  colorRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  colorCheck: { fontWeight: '800', fontSize: 14 },
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
  // Neighbouring 40 pt IconButtons sit two slops apart, so their touch targets meet without
  // overlapping (8 dp on Android, 4 pt on iOS). H-02 replaces the three with one control.
  rowIconBtn: { marginLeft: 2 * hitSlopFor(40).left },
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
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold' },
  sheetCloseBtn: { padding: 4 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  magicBox: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 20 },
  magicTitle: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  magicRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  magicInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  magicBtn: { paddingHorizontal: 16, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minWidth: 60 },
  magicBtnText: { fontWeight: '700', fontSize: 14 },
  magicError: { fontSize: 12, marginTop: 6 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: ICON_GAP, marginBottom: 20 },
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
  sliderLabelText: { fontSize: 12 },
  saveBtn: { marginTop: 12, minHeight: 52 },
});
