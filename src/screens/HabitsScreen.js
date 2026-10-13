import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Animated,
  PanResponder, TouchableWithoutFeedback, Keyboard, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import Slider from '../components/Slider';
import BottomSheet from '../components/BottomSheet';
import EmptyCard from '../components/EmptyCard';
import { SheetDragHandle } from '../components/SheetHeader';
import TimePicker from '../components/TimePicker';
import { scheduleHabitReminder } from '../utils/notifications';
import { lightImpact, mediumImpact } from '../utils/haptics';

const ICONS = ['⭐', '🎯', '💪', '🧠', '✍️', '🎨', '🚶', '🛁', '🌿', '❤️', '💧', '🏃', '📚', '🧘', '😴', '🥗', '🍎', '☕', '🎵', '🌅'];
const BLANK = { name: '', icon: '⭐', type: 'daily', volumeGoal: 3, customIconUri: null };
const DEFAULT_REMINDER = { enabled: false, hour12: 9, minute: 0, ampm: 'AM' };

function formatReminder(reminder) {
  if (!reminder?.enabled) return null;
  const { hour12, minute, ampm } = reminder;
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

function IconPicker({ selected, onSelect, customIconUri, onCustomIcon, theme }) {
  return (
    <View style={styles.iconGrid}>
      {ICONS.map(icon => (
        <TouchableOpacity
          key={icon}
          style={[
            styles.iconBtn,
            { backgroundColor: theme.bg, borderColor: selected === icon && !customIconUri ? theme.primary : theme.border },
            selected === icon && !customIconUri && { backgroundColor: theme.primaryLight },
          ]}
          onPress={() => onSelect(icon)}
        >
          <Text style={styles.iconBtnText}>{icon}</Text>
        </TouchableOpacity>
      ))}
      {/* Camera / Gallery button */}
      <TouchableOpacity
        style={[
          styles.iconBtn,
          { backgroundColor: theme.bg, borderColor: customIconUri ? theme.primary : theme.border },
          customIconUri && { backgroundColor: theme.primaryLight },
        ]}
        onPress={onCustomIcon}
      >
        {customIconUri ? (
          <Image source={{ uri: customIconUri }} style={{ width: 28, height: 28, borderRadius: 4 }} />
        ) : (
          <Ionicons name="add-outline" size={26} color={theme.textMuted} />
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

  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      translateY.setValue(700);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      animateClose(null);
    }
  }, [visible, animateClose]);

  const animateClose = useCallback((cb) => {
    Animated.timing(translateY, { toValue: 700, duration: 220, useNativeDriver: true }).start(() => {
      setInternalVisible(false);
      cb?.();
    });
  }, [translateY]);

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
        Alert.alert('Permission needed', 'Allow photo access to use a custom icon.');
        return;
      }
    }

    Alert.alert('Custom Icon', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
          if (!result.canceled) setForm(f => ({ ...f, customIconUri: result.assets[0].uri, icon: null }));
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
          if (!result.canceled) setForm(f => ({ ...f, customIconUri: result.assets[0].uri, icon: null }));
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleClose = () => animateClose(onClose);

  return (
    <BottomSheet visible={internalVisible} onClose={handleClose} translateY={translateY} backgroundColor={theme.surface} maxHeight="90%">
          <SheetDragHandle panHandlers={panResponder.panHandlers} theme={theme} />

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>
              {editingId ? 'Edit Habit' : 'New Habit'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.sheetCloseBtn}>
              <Ionicons name="close" size={24} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View>
                <Text style={[styles.label, { color: theme.textMuted }]}>Icon</Text>
                <IconPicker
                  selected={form.icon}
                  onSelect={icon => setForm(f => ({ ...f, icon, customIconUri: null }))}
                  customIconUri={form.customIconUri}
                  onCustomIcon={handlePickImage}
                  theme={theme}
                />

                <Text style={[styles.label, { color: theme.textMuted }]}>Name</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
                  placeholder="e.g. Walk 10,000 steps"
                  placeholderTextColor={theme.textMuted}
                  value={form.name}
                  onChangeText={name => setForm(f => ({ ...f, name }))}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={[styles.label, { color: theme.textMuted }]}>Type</Text>
                <View style={styles.typeRow}>
                  {['daily', 'volume'].map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typeBtn,
                        { borderColor: form.type === t ? theme.primary : theme.border },
                        form.type === t && { backgroundColor: theme.primaryLight },
                      ]}
                      onPress={() => setForm(f => ({ ...f, type: t }))}
                    >
                      <Text style={[styles.typeBtnText, { color: form.type === t ? theme.primary : theme.textMuted }]}>
                        {t === 'daily' ? '✓  Once a day' : '🔢  Volume goal'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {form.type === 'volume' && (
                  <>
                    <Text style={[styles.label, { color: theme.textMuted }]}>Times per day: {form.volumeGoal}</Text>
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
                        >
                          <Text style={[styles.volMaxBtnText, { color: volMax === opt.max ? theme.primary : theme.textMuted }]}>
                            Max {opt.label}
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
                    />
                    <View style={styles.sliderLabels}>
                      <Text style={[styles.sliderLabelText, { color: theme.textMuted }]}>2</Text>
                      <Text style={[styles.sliderLabelText, { color: theme.textMuted }]}>{volMax}</Text>
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>

            {/* Save button at bottom of scroll */}
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: form.name.trim() ? theme.primary : theme.border, marginTop: 12 }]}
              onPress={onSave}
              disabled={!form.name.trim()}
            >
              <Text style={styles.saveBtnText}>{editingId ? 'Save Changes' : 'Add Habit'}</Text>
            </TouchableOpacity>
          </ScrollView>
    </BottomSheet>
  );
}

function HabitRow({ habit, theme, onEdit, onDelete, onBell }) {
  const reminderTime = formatReminder(habit.reminder);
  const reminderOn = habit.reminder?.enabled;
  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {habit.customIconUri ? (
        <Image source={{ uri: habit.customIconUri }} style={styles.rowIconImage} />
      ) : (
        <Text style={styles.rowIcon}>{habit.icon}</Text>
      )}
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>{habit.name}</Text>
        <View style={styles.rowMeta}>
          <View style={[styles.typePill, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.typePillText, { color: theme.primary }]}>
              {habit.type === 'daily' ? 'Daily' : `${habit.volumeGoal}× / day`}
            </Text>
          </View>
          {reminderTime && (
            <View style={[styles.reminderPill, { backgroundColor: theme.primaryLight }]}>
              <Text style={[styles.reminderPillText, { color: theme.primary }]}>🔔 {reminderTime}</Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.bellBtn} onPress={onBell}>
        <Ionicons
          name={reminderOn ? 'notifications' : 'notifications-outline'}
          size={20}
          color={reminderOn ? theme.primary : theme.textMuted}
        />
      </TouchableOpacity>
      <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
        <Text style={[styles.editBtnText, { color: theme.textMuted }]}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
        <Text style={styles.deleteBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function HabitsScreen() {
  const {
    habits, addHabit, updateHabit, deleteHabit, theme,
    pendingHabitLinkChallenge, setPendingHabitLinkChallenge, linkHabitToChallenge,
    setModalOpen, settings, updateSettings,
  } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [reminderTarget, setReminderTarget] = useState(null);

  // Track modal open for swipe lock
  useEffect(() => { setModalOpen(modalVisible || !!reminderTarget); }, [modalVisible, reminderTarget]);

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
    setEditingId(null);
    setForm(BLANK);
    setModalVisible(true);
  };

  const openEdit = (habit) => {
    setEditingId(habit.id);
    setForm({ name: habit.name, icon: habit.icon, type: habit.type, volumeGoal: habit.volumeGoal, customIconUri: habit.customIconUri ?? null });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (settings.hapticsEnabled) mediumImpact();
    const habit = {
      ...form,
      name: form.name.trim(),
      volumeGoal: form.type === 'daily' ? 1 : Math.max(1, Number(form.volumeGoal) || 1),
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

  const handleDelete = (id, name) => {
    if (settings.hapticsEnabled) lightImpact();
    Alert.alert('Delete Habit', `Remove "${name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteHabit(id) },
    ]);
  };

  const handleReminderSave = async (habitId, reminderData) => {
    const updatedReminder = { ...reminderData, enabled: true };
    const habit = habits.find(h => h.id === habitId);
    updateHabit(habitId, { reminder: updatedReminder });
    if (settings.notificationsEnabled) {
      await scheduleHabitReminder({ ...habit, reminder: updatedReminder });
    }

    // Sync into settings.reminders so the entry appears in the Settings screen
    const reminderId = `habit-${habitId}`;
    const newEntry = {
      id: reminderId,
      label: habit.name,
      time: { hour12: updatedReminder.hour12, minute: updatedReminder.minute, ampm: updatedReminder.ampm },
      enabled: true,
      habitId: habitId,
    };
    const existing = (settings.reminders || []);
    const idx = existing.findIndex(r => r.id === reminderId);
    const newReminders = idx >= 0
      ? existing.map((r, i) => i === idx ? newEntry : r)
      : [...existing, newEntry];
    updateSettings({ reminders: newReminders });

    setReminderTarget(null);
  };

  const handleReminderToggleOff = async (habit) => {
    updateHabit(habit.id, { reminder: { ...habit.reminder, enabled: false } });
    await scheduleHabitReminder({ ...habit, reminder: { enabled: false } });

    // Mirror the disabled state in settings.reminders
    const reminderId = `habit-${habit.id}`;
    const existing = settings.reminders || [];
    if (existing.some(r => r.id === reminderId)) {
      updateSettings({ reminders: existing.map(r => r.id === reminderId ? { ...r, enabled: false } : r) });
    }
  };

  const targetHabit = reminderTarget ? habits.find(h => h.id === reminderTarget) : null;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={[styles.heading, { color: theme.text }]}>My Habits</Text>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.primary }]} onPress={openAdd}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {habits.length === 0 ? (
          <EmptyCard
            emoji="📋"
            title="No Habits Yet"
            body="Get started"
            theme={theme}
            titleColor={theme.textMuted}
            style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}
          />
        ) : (
          habits.map(habit => (
            <HabitRow
              key={habit.id}
              habit={habit}
              theme={theme}
              onEdit={() => openEdit(habit)}
              onDelete={() => handleDelete(habit.id, habit.name)}
              onBell={() => { lightImpact(); habit.reminder?.enabled ? handleReminderToggleOff(habit) : setReminderTarget(habit.id); }}
            />
          ))
        )}
      </ScrollView>

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
  row: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1,
    padding: 14, marginBottom: 10,
  },
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
  deleteBtnText: { fontSize: 14, color: '#EF4444', fontWeight: 'bold' },
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
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  iconBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 22 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 20 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  typeBtnText: { fontSize: 14, fontWeight: '600' },
  volMaxRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  volMaxBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  volMaxBtnText: { fontSize: 12, fontWeight: '700' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  sliderLabelText: { fontSize: 11 },
  saveBtn: { marginTop: 12, padding: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
