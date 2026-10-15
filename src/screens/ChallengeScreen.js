import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Platform,
  PanResponder, Keyboard, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, getChallengeTier, TIER_STYLES } from '../context/AppContext';
import Slider from '../components/Slider';
import BottomSheet from '../components/BottomSheet';
import EmptyCard from '../components/EmptyCard';
import { SheetDragHandle, SheetHeader } from '../components/SheetHeader';
import CelebrationOverlay from '../components/CelebrationOverlay';
import { lightImpact, mediumImpact } from '../utils/haptics';
import { addDays } from '../utils/dates';
import { currentChallengeDay, isChallengeExpired } from '../utils/challenges';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const RANGE_OPTIONS = [
  { label: 'Week', max: 7 },
  { label: 'Month', max: 30 },
  { label: 'Year', max: 365 },
];

// ── Shared bottom-sheet animation ─────────────────────────────────────────────

function useSheetAnim() {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [internalVisible, setInternalVisible] = useState(false);

  const open = useCallback(() => {
    setInternalVisible(true);
    translateY.setValue(SCREEN_HEIGHT);
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
  }, [translateY]);

  const close = useCallback((cb) => {
    Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }).start(() => {
      setInternalVisible(false);
      cb?.();
    });
  }, [translateY]);

  return { translateY, internalVisible, open, close };
}

function makeDragPanResponder(translateY, onClose) {
  return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
    onPanResponderMove: (_, gs) => { if (gs.dy > 0) translateY.setValue(gs.dy); },
    onPanResponderRelease: (_, gs) => {
      if (gs.dy > 80) {
        onClose();
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80 }).start();
      }
    },
  });
}

// ── Day badge ─────────────────────────────────────────────────────────────────

function DayBadge({ dayNum, completed, isCurrent, isMissed, theme }) {
  let bg = theme.progressBarBg;
  let textColor = theme.textMuted;
  let label = String(dayNum);
  let borderColor = theme.border;

  if (completed) { bg = theme.primary; textColor = '#fff'; label = '✓'; borderColor = theme.primary; }
  else if (isCurrent) { borderColor = theme.primary; textColor = theme.primary; }
  else if (isMissed) { bg = theme.surface; textColor = theme.textMuted; }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const CHALLENGE_ICONS = ['🏆', '🎯', '💪', '🔥', '⚡', '🌟', '🏃', '🧠', '🎨', '📚', '💎', '🌱', '🥊', '🚀', '🎵', '🌊'];

// ── Challenge form modal (includes inline habit linking) ──────────────────────

function ChallengeFormModal({ visible, initial, habits, onClose, onSave, onAddHabit, theme }) {
  const { settings } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(7);
  const [rangeMax, setRangeMax] = useState(7);
  const [icon, setIcon] = useState('🏆');
  const [selectedHabitIds, setSelectedHabitIds] = useState([]);
  const sheet = useSheetAnim();

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setDescription(initial?.description ?? '');
      setIcon(initial?.icon ?? '🏆');
      const d = initial?.days ?? 7;
      setDays(d);
      setRangeMax(d <= 7 ? 7 : d <= 30 ? 30 : 365);
      setSelectedHabitIds(initial?.linkedHabitIds || []);
      sheet.open();
    } else {
      sheet.close(null);
    }
  }, [visible]);

  const doClose = () => sheet.close(onClose);
  const pan = useRef(makeDragPanResponder(sheet.translateY, doClose)).current;

  // Can only save if name is filled AND (no habits exist yet OR at least one is linked)
  const canSave = name.trim().length > 0 && (habits.length === 0 || selectedHabitIds.length > 0);

  const handleSave = () => {
    if (!canSave) return;
    if (settings.hapticsEnabled) mediumImpact();
    onSave({ name: name.trim(), description: description.trim(), days, icon, linkedHabitIds: selectedHabitIds });
    sheet.close(onClose);
  };

  const handleRangeChange = (max) => {
    setRangeMax(max);
    if (days > max) setDays(max);
  };

  const toggleHabit = (habitId) => {
    setSelectedHabitIds(prev =>
      prev.includes(habitId) ? prev.filter(id => id !== habitId) : [...prev, habitId]
    );
  };

  return (
    <BottomSheet visible={sheet.internalVisible} onClose={doClose} translateY={sheet.translateY} backgroundColor={theme.surface}>
      <SheetHeader
        title={initial ? 'Edit Challenge' : 'New Challenge'}
        onClose={doClose}
        panHandlers={pan.panHandlers}
        theme={theme}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <Text style={[styles.label, { color: theme.textMuted }]}>Icon</Text>
        <View style={styles.iconPickerRow}>
          {CHALLENGE_ICONS.map(ic => (
            <TouchableOpacity
              key={ic}
              style={[
                styles.iconPickerBtn,
                { backgroundColor: theme.bg, borderColor: icon === ic ? theme.primary : theme.border },
                icon === ic && { backgroundColor: theme.primaryLight },
              ]}
              onPress={() => setIcon(ic)}
              accessibilityRole="button"
              accessibilityLabel={`Icon ${ic}`}
              accessibilityState={{ selected: icon === ic }}
            >
              <Text style={styles.iconPickerEmoji}>{ic}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: theme.textMuted }]}>Name</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
          value={name}
          onChangeText={setName}
          accessibilityLabel="Challenge name"
          placeholder="e.g. 7-Day Strong"
          placeholderTextColor={theme.textMuted}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMulti, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
          value={description}
          onChangeText={setDescription}
          accessibilityLabel="Challenge description"
          placeholder="What's the goal?"
          placeholderTextColor={theme.textMuted}
          multiline
          numberOfLines={3}
        />

        <Text style={[styles.label, { color: theme.textMuted }]}>
          Duration: {days} day{days !== 1 ? 's' : ''}
        </Text>

        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.label}
              style={[
                styles.rangeBtn,
                { borderColor: rangeMax === opt.max ? theme.primary : theme.border },
                rangeMax === opt.max && { backgroundColor: theme.primaryLight },
              ]}
              onPress={() => handleRangeChange(opt.max)}
              accessibilityRole="button"
              accessibilityLabel={`${opt.label}, up to ${opt.max} days`}
              accessibilityState={{ selected: rangeMax === opt.max }}
            >
              <Text style={[styles.rangeBtnText, { color: rangeMax === opt.max ? theme.primary : theme.textMuted }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Slider value={days} min={1} max={rangeMax} onValueChange={setDays} theme={theme} label="Challenge duration in days" />

        <View style={styles.sliderLabels}>
          <Text style={[styles.sliderLabelText, { color: theme.textMuted }]}>1</Text>
          <Text style={[styles.sliderLabelText, { color: theme.textMuted }]}>{rangeMax}</Text>
        </View>

        {/* ── Linked habits ── */}
        <Text style={[styles.label, { color: theme.textMuted }]}>Linked Habits</Text>

        {habits.length === 0 ? (
          <Text style={[styles.noHabitsInForm, { color: theme.textMuted }]}>
            No habits yet. Go to the Habits tab to create some.
          </Text>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.linkAllBtn, { borderColor: theme.primary, backgroundColor: theme.primaryLight }]}
              onPress={() => setSelectedHabitIds(habits.map(h => h.id))}
              accessibilityRole="button"
              accessibilityLabel="Link all habits"
            >
              <Text style={[styles.linkAllBtnText, { color: theme.primary }]}>⚡ Link All Habits</Text>
            </TouchableOpacity>

            {habits.map(habit => {
              const isLinked = selectedHabitIds.includes(habit.id);
              return (
                <TouchableOpacity
                  key={habit.id}
                  style={[
                    styles.habitLinkRow,
                    {
                      backgroundColor: isLinked ? theme.primaryLight : theme.bg,
                      borderColor: isLinked ? theme.primary : theme.border,
                    },
                  ]}
                  onPress={() => toggleHabit(habit.id)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityLabel={habit.name}
                  accessibilityState={{ checked: isLinked }}
                >
                  <Text style={styles.habitLinkIcon}>{habit.icon || '⭐'}</Text>
                  <Text style={[styles.habitLinkName, { color: theme.text }]} numberOfLines={1}>
                    {habit.name}
                  </Text>
                  <View style={[
                    styles.habitLinkCheck,
                    { backgroundColor: isLinked ? theme.primary : 'transparent', borderColor: isLinked ? theme.primary : theme.border },
                  ]}>
                    {isLinked && <Text style={styles.habitLinkCheckMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            {selectedHabitIds.length === 0 && (
              <Text style={[styles.linkWarning, { color: '#D97706' }]}>
                Select at least one habit to save this challenge.
              </Text>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.addHabitInModalBtn, { borderColor: theme.border }]}
          onPress={() => { doClose(); onAddHabit?.(); }}
          accessibilityRole="button"
          accessibilityLabel="Add new habit"
        >
          <Text style={[styles.addHabitInModalText, { color: theme.primary }]}>+ Add New Habit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: canSave ? theme.primary : theme.border, marginTop: 8 }]}
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={initial ? 'Save changes' : 'Create challenge'}
          accessibilityState={{ disabled: !canSave }}
        >
          <Text style={styles.saveBtnText}>{initial ? 'Save Changes' : 'Create Challenge'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheet>
  );
}

// ── Past challenge detail modal ───────────────────────────────────────────────

function PastChallengeDetailModal({ challenge, onClose, theme }) {
  const sheet = useSheetAnim();

  useEffect(() => { if (challenge) sheet.open(); }, [challenge]);

  const doClose = () => sheet.close(onClose);
  const pan = useRef(makeDragPanResponder(sheet.translateY, doClose)).current;

  if (!challenge) return null;

  const tier = challenge.tier || getChallengeTier(challenge.completedDays?.length ?? 0, challenge.days);
  const ts = TIER_STYLES[tier];
  const completedCount = challenge.completedDays?.length ?? 0;
  const progress = challenge.days > 0 ? completedCount / challenge.days : 0;
  const cardBg = ts.bg || theme.surface;
  const cardBorder = ts.border || theme.border;
  const textColor = ts.text || theme.text;
  const subColor = ts.text || theme.textMuted;

  return (
    <Modal visible={sheet.internalVisible} animationType="none" transparent onRequestClose={doClose}>
      <View style={styles.overlay}>
        <View style={styles.overlayBg} />
        <Animated.View style={[styles.sheet, { backgroundColor: cardBg, transform: [{ translateY: sheet.translateY }] }]}>
          <SheetDragHandle panHandlers={pan.panHandlers} theme={theme} color={cardBorder} />

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: textColor }]}>
              {ts.trophy} {challenge.name}
            </Text>
            <TouchableOpacity onPress={doClose} style={styles.sheetCloseBtn} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={[styles.sheetCloseTxt, { color: subColor }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {tier !== 'none' && (
              <View style={[styles.completeBanner, { backgroundColor: cardBorder }]}>
                <Text style={styles.completeBannerText}>{ts.badge} {tier.charAt(0).toUpperCase() + tier.slice(1)} Completion!</Text>
              </View>
            )}

            <Text style={[styles.pastDesc, { color: subColor }]}>{challenge.description || 'No description'}</Text>

            <Text style={[styles.label, { color: subColor }]}>Progress: {completedCount}/{challenge.days} days</Text>

            <View style={[styles.progressBg, { backgroundColor: tier !== 'none' ? cardBorder + '40' : theme.progressBarBg }]}>
              <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: cardBorder || theme.primary }]} />
            </View>
            <Text style={[styles.progressLabel, { color: subColor }]}>{Math.round(progress * 100)}% complete</Text>

            <View style={styles.badgeRow}>
              {Array.from({ length: challenge.days }).map((_, i) => {
                const completed = i < completedCount;
                return (
                  <View key={i} style={[styles.badge, {
                    backgroundColor: completed ? (cardBorder || theme.primary) : theme.progressBarBg,
                    borderColor: completed ? (cardBorder || theme.primary) : theme.border,
                  }]}>
                    <Text style={[styles.badgeText, { color: completed ? '#fff' : theme.textMuted }]}>
                      {completed ? '✓' : String(i + 1)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {challenge.startDate && (
              <Text style={[styles.pastMeta, { color: subColor }]}>
                Started: {new Date(challenge.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Challenge card ────────────────────────────────────────────────────────────

function ChallengeCard({ challenge, habits, today, onEdit, onDelete, theme }) {
  const [showLinked, setShowLinked] = useState(false);
  const completedCount = challenge.completedDays.length;
  const currentDay = currentChallengeDay(challenge, today);
  const progress = challenge.days > 0 ? completedCount / challenge.days : 0;
  const linked = challenge.linkedHabitIds || [];
  const linkedHabits = linked.length > 0 ? habits.filter(h => linked.includes(h.id)) : [];
  const todayDone = challenge.completedDays.includes(today);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.challengeHeader}>
        <Text style={styles.trophy}>{challenge.icon || '🏆'}</Text>
        <View style={styles.challengeInfo}>
          <Text style={[styles.challengeName, { color: theme.text }]}>{challenge.name}</Text>
          <Text style={[styles.challengeSub, { color: theme.textMuted }]}>
            Day {currentDay} of {challenge.days} · {completedCount} completed
          </Text>
        </View>
        <TouchableOpacity onPress={onEdit} style={styles.editBtn} accessibilityRole="button" accessibilityLabel={`Edit ${challenge.name}`}>
          <Text style={[styles.editBtnText, { color: theme.textMuted }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} accessibilityRole="button" accessibilityLabel="Delete challenge">
          <Text style={[styles.deleteBtnText, { color: theme.danger }]}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Day badges */}
      <View style={styles.badgeRow}>
        {Array.from({ length: challenge.days }).map((_, i) => {
          const dayDate = challenge.startDate ? addDays(challenge.startDate, i) : null;
          const completed = dayDate ? challenge.completedDays.includes(dayDate) : i < completedCount;
          const isCurrent = i + 1 === currentDay && !completed;
          const isMissed = dayDate && dayDate < today && !completed;
          return (
            <DayBadge
              key={i}
              dayNum={i + 1}
              completed={completed}
              isCurrent={isCurrent}
              isMissed={isMissed}
              theme={theme}
            />
          );
        })}
      </View>

      <View style={[styles.progressBg, { backgroundColor: theme.progressBarBg }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.primary }]} />
      </View>
      <Text style={[styles.progressLabel, { color: theme.textMuted }]}>
        {Math.round(progress * 100)}% complete
      </Text>

      {challenge.description ? (
        <Text style={[styles.desc, { color: theme.textMuted }]}>{challenge.description}</Text>
      ) : null}

      {/* Linked habits — collapsible dropdown, no Manage button */}
      <View style={[styles.linkedSection, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={styles.linkedTitleArea}
          onPress={() => linkedHabits.length > 0 && setShowLinked(v => !v)}
          activeOpacity={linkedHabits.length > 0 ? 0.7 : 1}
          accessibilityRole="button"
          accessibilityLabel={linked.length > 0 ? `Linked habits, ${linked.length}` : 'No habits linked'}
          accessibilityState={{ expanded: showLinked, disabled: linkedHabits.length === 0 }}
        >
          <Text style={[styles.linkedTitle, { color: theme.textMuted }]}>
            {linked.length > 0 ? `Linked Habits (${linked.length})` : 'No habits linked'}
          </Text>
          {linkedHabits.length > 0 && (
            <Text style={[styles.linkedChevron, { color: theme.textMuted }]}>
              {showLinked ? ' ▲' : ' ▼'}
            </Text>
          )}
        </TouchableOpacity>
        {showLinked && linkedHabits.length > 0 && (
          <View style={styles.linkedPills}>
            {linkedHabits.map(h => (
              <View key={h.id} style={[styles.linkedPill, { backgroundColor: theme.primaryLight }]}>
                <Text style={styles.linkedPillIcon}>{h.icon || '⭐'}</Text>
                <Text style={[styles.linkedPillText, { color: theme.primary }]} numberOfLines={1}>{h.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Today status */}
      <View style={[styles.todayStatus, { borderTopColor: theme.border }]}>
        {todayDone ? (
          <Text style={[styles.claimDoneText, { color: theme.success }]}>✅ Today's logged!</Text>
        ) : linked.length === 0 ? (
          <Text style={[styles.claimWaiting, { color: theme.textMuted }]}>
            Tap Edit to link habits to this challenge.
          </Text>
        ) : (
          <Text style={[styles.claimWaiting, { color: theme.textMuted }]}>
            Complete your linked habits to auto-claim today.
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ChallengeScreen() {
  const {
    habits, challenges, effectiveChallenges, effectivePastChallenges,
    theme, settings,
    editChallenge, createChallenge, deleteChallenge,
    setRequestedTab, setPendingHabitLinkChallenge,
    setModalOpen,
    todayStr,
  } = useApp();
  const today = todayStr();

  const [celebrating, setCelebrating] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState(null);
  const [selectedPast, setSelectedPast] = useState(null);

  const anyModalOpen = formVisible || !!selectedPast;
  useEffect(() => { setModalOpen(anyModalOpen); }, [anyModalOpen]);

  const handleDelete = (challenge) => {
    if (settings.hapticsEnabled) lightImpact();
    Alert.alert('Delete Challenge', `Remove "${challenge.name}"? It will be moved to Past Challenges.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteChallenge(challenge.id) },
    ]);
  };

  const openNew = () => {
    if (settings.hapticsEnabled) lightImpact();
    setEditingChallenge(null);
    setFormVisible(true);
  };

  const openEdit = (challenge) => {
    setEditingChallenge(challenge);
    setFormVisible(true);
  };

  const handleSaveForm = ({ name, description, days, icon, linkedHabitIds }) => {
    if (editingChallenge) {
      editChallenge(editingChallenge.id, { name, description, days, icon, linkedHabitIds });
    } else {
      createChallenge(name, description, days, icon, linkedHabitIds);
    }
  };

  // Navigate to Habits tab to add a new habit.
  // For edit mode, set pending link so the new habit auto-links to this challenge.
  const handleAddHabit = () => {
    if (editingChallenge) {
      setPendingHabitLinkChallenge(editingChallenge.id);
    }
    setRequestedTab(3);
  };

  const canAddMore = effectiveChallenges.length < 3;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headingRow}>
          <Text style={[styles.heading, { color: theme.text }]}>Challenges</Text>
          {canAddMore && (
            <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.primary }]} onPress={openNew} accessibilityRole="button" accessibilityLabel="New challenge">
              <Text style={styles.newBtnText}>+ New</Text>
            </TouchableOpacity>
          )}
        </View>

        {effectiveChallenges.length === 0 ? (
          <EmptyCard
            emoji="🏆"
            title="No challenges yet"
            body='Tap "+ New" to create your first challenge.'
            theme={theme}
            style={{ backgroundColor: theme.surface, borderWidth: 1, marginTop: 0 }}
          >
            <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: theme.primary }]} onPress={openNew} accessibilityRole="button">
              <Text style={styles.emptyBtnText}>Create a Challenge</Text>
            </TouchableOpacity>
          </EmptyCard>
        ) : (
          effectiveChallenges.map(challenge => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              habits={habits}
              today={today}
              onEdit={() => openEdit(challenge)}
              onDelete={() => handleDelete(challenge)}
              theme={theme}
            />
          ))
        )}

        {/* Tip: only shown before the user has any past challenges */}
        {effectiveChallenges.length > 0 && effectiveChallenges.length < 3 && effectivePastChallenges.length === 0 && (
          <View style={[styles.card, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
            <Text style={[styles.tipTitle, { color: theme.primary }]}>💡 Tip</Text>
            <Text style={[styles.tipBody, { color: theme.text }]}>
              You can run up to 3 challenges at once. Link specific habits to each challenge.
            </Text>
          </View>
        )}

        {/* Past Challenges */}
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>PAST CHALLENGES</Text>
          {effectivePastChallenges.length === 0 ? (
            <View style={[styles.pastEmptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.pastEmptyText, { color: theme.textMuted }]}>
                Completed or deleted challenges will appear here.
              </Text>
            </View>
          ) : (
            effectivePastChallenges.map((ch, i) => {
              const tier = ch.tier || getChallengeTier(ch.completedDays?.length ?? 0, ch.days);
              const ts = TIER_STYLES[tier];
              const cardBg = ts.bg || theme.surface;
              const cardBorder = ts.border || theme.border;
              const nameColor = ts.text || theme.text;
              const subColor = ts.text || theme.textMuted;
              return (
                <TouchableOpacity
                  key={ch.id ?? i}
                  style={[styles.pastRow, { backgroundColor: cardBg, borderColor: cardBorder }]}
                  onPress={() => setSelectedPast(ch)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={tier !== 'none'
                    ? `${ch.name}, ${tier} completion, ${ch.completedDays?.length ?? 0} of ${ch.days} days`
                    : `${ch.name}, ended, ${ch.completedDays?.length ?? 0} of ${ch.days} days`}
                >
                  <Text style={styles.pastEmoji}>{ts.trophy}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pastName, { color: nameColor }]}>{ch.name}</Text>
                    <Text style={[styles.pastSub, { color: subColor }]}>
                      {ch.completedDays?.length ?? 0}/{ch.days} days
                      {tier !== 'none' ? ` · ${tier.charAt(0).toUpperCase() + tier.slice(1)} ✓` : ' · Ended'}
                    </Text>
                  </View>
                  {tier !== 'none' && <Text style={{ fontSize: 20 }}>{ts.badge}</Text>}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      <CelebrationOverlay visible={celebrating} onDone={() => setCelebrating(false)} />

      <ChallengeFormModal
        visible={formVisible}
        initial={editingChallenge}
        habits={habits}
        onClose={() => setFormVisible(false)}
        onSave={handleSaveForm}
        onAddHabit={handleAddHabit}
        theme={theme}
      />

      <PastChallengeDetailModal
        challenge={selectedPast}
        onClose={() => setSelectedPast(null)}
        theme={theme}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 40 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heading: { fontSize: 28, fontWeight: 'bold' },
  newBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 16 },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  trophy: { fontSize: 32 },
  challengeInfo: { flex: 1 },
  challengeName: { fontSize: 17, fontWeight: 'bold' },
  challengeSub: { fontSize: 12, marginTop: 2 },
  editBtn: { padding: 6 },
  editBtnText: { fontSize: 13, fontWeight: '600' },
  deleteBtn: { padding: 6 },
  deleteBtnText: { fontSize: 16, fontWeight: 'bold' },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  badge: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: 'bold' },
  progressBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: 8, borderRadius: 4 },
  progressLabel: { fontSize: 12, marginBottom: 8 },
  desc: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  linkedSection: { borderTopWidth: 1, paddingTop: 12, marginTop: 4 },
  linkedTitleArea: { flexDirection: 'row', alignItems: 'center' },
  linkedTitle: { fontSize: 12, fontWeight: '600' },
  linkedChevron: { fontSize: 10, fontWeight: '700' },
  linkedPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  linkedPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, gap: 4, maxWidth: 140 },
  linkedPillIcon: { fontSize: 14 },
  linkedPillText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  todayStatus: { borderTopWidth: 1, paddingTop: 12, marginTop: 8 },
  claimDoneText: { fontSize: 15, fontWeight: '600' },
  claimWaiting: { fontSize: 13, lineHeight: 18 },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 36, alignItems: 'center', borderStyle: 'dashed' },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tipTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  tipBody: { fontSize: 14, lineHeight: 20 },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  pastEmptyCard: { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 20, alignItems: 'center', marginBottom: 10 },
  pastEmptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  pastEmoji: { fontSize: 24 },
  pastName: { fontSize: 15, fontWeight: '600' },
  pastSub: { fontSize: 12, marginTop: 2 },
  completeBanner: { borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 16 },
  completeBannerText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  pastDesc: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  pastMeta: { fontSize: 12, marginTop: 12 },
  // Form & habit linking
  noHabitsInForm: { fontSize: 13, marginBottom: 16, fontStyle: 'italic' },
  linkAllBtn: { borderWidth: 1.5, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12 },
  linkAllBtnText: { fontSize: 15, fontWeight: '700' },
  habitLinkRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, padding: 12, marginBottom: 10, gap: 10 },
  habitLinkIcon: { fontSize: 22 },
  habitLinkName: { flex: 1, fontSize: 15, fontWeight: '500' },
  habitLinkCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  habitLinkCheckMark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  linkWarning: { fontSize: 13, marginBottom: 10, fontStyle: 'italic' },
  addHabitInModalBtn: { borderWidth: 1.5, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 16, borderStyle: 'dashed' },
  addHabitInModalText: { fontSize: 15, fontWeight: '700' },
  // Icon picker
  iconPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  iconPickerBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  iconPickerEmoji: { fontSize: 22 },
  // Sheet / modal styles
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '92%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold' },
  sheetCloseBtn: { padding: 4 },
  sheetCloseTxt: { fontSize: 20, fontWeight: 'bold' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16 },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  rangeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  rangeBtnText: { fontSize: 13, fontWeight: '700' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, marginHorizontal: 4 },
  sliderLabelText: { fontSize: 11 },
  saveBtn: { padding: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
