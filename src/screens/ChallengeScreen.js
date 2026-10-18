import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Platform,
  PanResponder, Keyboard, Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAreaView from '../components/SafeAreaView';
import { useApp, getChallengeTier, TIER_STYLES } from '../context/AppContext';
import Slider from '../components/Slider';
import BottomSheet from '../components/BottomSheet';
import EmptyCard from '../components/EmptyCard';
import { SheetDragHandle, SheetHeader } from '../components/SheetHeader';
import CelebrationOverlay from '../components/CelebrationOverlay';
import { lightImpact, mediumImpact } from '../utils/haptics';
import { addDays } from '../utils/dates';
import { currentChallengeDay, isChallengeExpired } from '../utils/challenges';
import { getChallengeTemplates } from '../utils/habits';
import { t, getLocale, useLocale } from '../i18n';
import OverlayModal from '../components/ui/OverlayModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const RANGE_OPTIONS = [
  { key: 'week', max: 7 },
  { key: 'month', max: 30 },
  { key: 'year', max: 365 },
];

const tierLabel = (tier) => t(`tier.${tier}`);

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
  let bg = theme.track;
  let textColor = theme.textSecondary;
  let label = String(dayNum);
  let borderColor = theme.border;

  if (completed) { bg = theme.meter; textColor = theme.onMeter; label = '✓'; borderColor = theme.meter; }
  else if (isCurrent) { borderColor = theme.selectionBorder; textColor = theme.link; }
  else if (isMissed) { bg = theme.surface; textColor = theme.textSecondary; }

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
  const templates = getChallengeTemplates();

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
    <BottomSheet visible={sheet.internalVisible} onClose={doClose} translateY={sheet.translateY}>
      <SheetHeader
        title={initial ? t('challenges.form.editTitle') : t('challenges.form.newTitle')}
        onClose={doClose}
        panHandlers={pan.panHandlers}
        theme={theme}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        {!initial && (
          <>
            <Text style={[styles.label, { color: theme.textSecondary }]}>{t('challenges.form.template')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
              {templates.map(tpl => {
                const active = days === tpl.days && name === tpl.name;
                return (
                  <TouchableOpacity
                    key={tpl.key}
                    style={[styles.templateChip, { borderColor: active ? theme.selectionBorder : theme.border, backgroundColor: active ? theme.selection : theme.bg }]}
                    onPress={() => {
                      if (settings.hapticsEnabled) lightImpact();
                      setName(tpl.name); setDescription(tpl.description); setIcon(tpl.icon);
                      setDays(tpl.days); setRangeMax(tpl.days <= 7 ? 7 : tpl.days <= 30 ? 30 : 365);
                      if (selectedHabitIds.length === 0) setSelectedHabitIds(habits.map(h => h.id));
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('challenges.form.templateA11y', { name: tpl.name })}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={styles.templateEmoji}>{tpl.icon}</Text>
                    <Text style={[styles.templateDays, { color: active ? theme.onSelection : theme.text }]}>{t('challenges.form.templateDays', { count: tpl.days })}</Text>
                    <Text style={[styles.templateName, { color: theme.textSecondary }]} numberOfLines={1}>{tpl.shortName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('challenges.form.icon')}</Text>
        <View style={styles.iconPickerRow}>
          {CHALLENGE_ICONS.map(ic => (
            <TouchableOpacity
              key={ic}
              style={[
                styles.iconPickerBtn,
                { backgroundColor: theme.bg, borderColor: icon === ic ? theme.selectionBorder : theme.border },
                icon === ic && { backgroundColor: theme.selection },
              ]}
              onPress={() => setIcon(ic)}
              accessibilityRole="button"
              accessibilityLabel={t('challenges.form.iconA11y', { icon: ic })}
              accessibilityState={{ selected: icon === ic }}
            >
              <Text style={styles.iconPickerEmoji}>{ic}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('challenges.form.name')}</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
          value={name}
          onChangeText={setName}
          accessibilityLabel={t('challenges.form.nameA11y')}
          placeholder={t('challenges.form.namePlaceholder')}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('challenges.form.description')}</Text>
        <TextInput
          style={[styles.input, styles.inputMulti, { borderColor: theme.border, color: theme.text, backgroundColor: theme.bg }]}
          value={description}
          onChangeText={setDescription}
          accessibilityLabel={t('challenges.form.descriptionA11y')}
          placeholder={t('challenges.form.descriptionPlaceholder')}
          placeholderTextColor={theme.textSecondary}
          multiline
          numberOfLines={3}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {t('challenges.form.duration', { count: days })}
        </Text>

        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.rangeBtn,
                { borderColor: rangeMax === opt.max ? theme.selectionBorder : theme.controlBorder },
                rangeMax === opt.max && { backgroundColor: theme.selection },
              ]}
              onPress={() => handleRangeChange(opt.max)}
              accessibilityRole="button"
              accessibilityLabel={t('challenges.form.rangeA11y', { label: t(`challenges.form.range.${opt.key}`), max: opt.max })}
              accessibilityState={{ selected: rangeMax === opt.max }}
            >
              <Text style={[styles.rangeBtnText, { color: rangeMax === opt.max ? theme.onSelection : theme.textSecondary }]}>
                {t(`challenges.form.range.${opt.key}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Slider value={days} min={1} max={rangeMax} onValueChange={setDays} theme={theme} label={t('challenges.form.durationA11y')} />

        <View style={styles.sliderLabels}>
          <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>1</Text>
          <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>{rangeMax}</Text>
        </View>

        {/* ── Linked habits ── */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('challenges.form.linked')}</Text>

        {habits.length === 0 ? (
          <Text style={[styles.noHabitsInForm, { color: theme.textSecondary }]}>
            {t('challenges.form.noHabits')}
          </Text>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.linkAllBtn, { borderColor: theme.actionTint, backgroundColor: theme.actionTint }]}
              onPress={() => setSelectedHabitIds(habits.map(h => h.id))}
              accessibilityRole="button"
              accessibilityLabel={t('challenges.form.linkAllA11y')}
            >
              <Text style={[styles.linkAllBtnText, { color: theme.onActionTint }]}>{t('challenges.form.linkAll')}</Text>
            </TouchableOpacity>

            {habits.map(habit => {
              const isLinked = selectedHabitIds.includes(habit.id);
              return (
                <TouchableOpacity
                  key={habit.id}
                  style={[
                    styles.habitLinkRow,
                    {
                      backgroundColor: isLinked ? theme.selection : theme.bg,
                      borderColor: isLinked ? theme.selectionBorder : theme.border,
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
                    { backgroundColor: isLinked ? theme.selectionBorder : 'transparent', borderColor: isLinked ? theme.selectionBorder : theme.controlBorder },
                  ]}>
                    {isLinked && <Text style={[styles.habitLinkCheckMark, { color: theme.onAction }]}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}

            {selectedHabitIds.length === 0 && (
              <View style={styles.linkWarningRow}>
                <Ionicons name="alert-circle-outline" size={16} color={theme.textSecondary} accessible={false} importantForAccessibility="no" aria-hidden />
                <Text style={[styles.linkWarning, { color: theme.textSecondary }]}>
                  {t('challenges.form.selectOne')}
                </Text>
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.addHabitInModalBtn, { borderColor: theme.border }]}
          onPress={() => { doClose(); onAddHabit?.(); }}
          accessibilityRole="button"
          accessibilityLabel={t('challenges.form.addNewA11y')}
        >
          <Text style={[styles.addHabitInModalText, { color: theme.link }]}>{t('challenges.form.addNew')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: canSave ? theme.action : theme.disabledContainer, marginTop: 8 }]}
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={initial ? t('challenges.form.saveA11y') : t('challenges.form.createA11y')}
          accessibilityState={{ disabled: !canSave }}
        >
          <Text style={[styles.saveBtnText, { color: canSave ? theme.onAction : theme.onDisabled }]}>{initial ? t('challenges.form.saveChanges') : t('challenges.form.create')}</Text>
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
  const subColor = ts.text || theme.textSecondary;

  return (
    <OverlayModal visible={sheet.internalVisible} animationType="none" transparent onRequestClose={doClose}>
      <View style={styles.overlay}>
        <View style={[styles.overlayBg, { backgroundColor: theme.scrim }]} />
        <Animated.View style={[styles.sheet, { backgroundColor: cardBg, transform: [{ translateY: sheet.translateY }] }]}>
          <SheetDragHandle panHandlers={pan.panHandlers} theme={theme} color={cardBorder} />

          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: textColor }]}>
              {ts.trophy} {challenge.name}
            </Text>
            <TouchableOpacity onPress={doClose} style={styles.sheetCloseBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={[styles.sheetCloseTxt, { color: subColor }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {tier !== 'none' && (
              <View style={[styles.completeBanner, { backgroundColor: cardBorder }]}>
                <Text style={[styles.completeBannerText, { color: theme.onTier }]}>{t('challenges.detail.completion', { badge: ts.badge, tier: tierLabel(tier) })}</Text>
              </View>
            )}

            <Text style={[styles.pastDesc, { color: subColor }]}>{challenge.description || t('challenges.detail.noDescription')}</Text>

            <Text style={[styles.label, { color: subColor }]}>{t('challenges.detail.progress', { done: completedCount, days: challenge.days })}</Text>

            <View style={[styles.progressBg, { backgroundColor: tier !== 'none' ? cardBorder + '40' : theme.track }]}>
              <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: cardBorder || theme.meter }]} />
            </View>
            <Text style={[styles.progressLabel, { color: subColor }]}>{t('challenges.card.percentComplete', { percent: Math.round(progress * 100) })}</Text>

            <View style={styles.badgeRow}>
              {Array.from({ length: challenge.days }).map((_, i) => {
                const completed = i < completedCount;
                return (
                  <View key={i} style={[styles.badge, {
                    backgroundColor: completed ? (cardBorder || theme.meter) : theme.track,
                    borderColor: completed ? (cardBorder || theme.meter) : theme.border,
                  }]}>
                    <Text style={[styles.badgeText, { color: completed ? (ts.border ? theme.onTier : theme.onMeter) : theme.textSecondary }]}>
                      {completed ? '✓' : String(i + 1)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {challenge.startDate && (
              <Text style={[styles.pastMeta, { color: subColor }]}>
                {t('challenges.detail.started', { date: new Date(challenge.startDate + 'T00:00:00').toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' }) })}
              </Text>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </OverlayModal>
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
          <Text style={[styles.challengeSub, { color: theme.textSecondary }]}>
            {t('challenges.card.sub', { day: currentDay, days: challenge.days, count: completedCount })}
          </Text>
        </View>
        <TouchableOpacity onPress={onEdit} style={styles.editBtn} accessibilityRole="button" accessibilityLabel={t('challenges.card.editA11y', { name: challenge.name })}>
          <Text style={[styles.editBtnText, { color: theme.textSecondary }]}>{t('common.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} accessibilityRole="button" accessibilityLabel={t('challenges.card.deleteA11y')}>
          <Text style={[styles.deleteBtnText, { color: theme.dangerText }]}>✕</Text>
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

      <View style={[styles.progressBg, { backgroundColor: theme.track }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.meter }]} />
      </View>
      <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>
        {t('challenges.card.percentComplete', { percent: Math.round(progress * 100) })}
      </Text>

      {challenge.description ? (
        <Text style={[styles.desc, { color: theme.textSecondary }]}>{challenge.description}</Text>
      ) : null}

      {/* Linked habits — collapsible dropdown, no Manage button */}
      <View style={[styles.linkedSection, { borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={styles.linkedTitleArea}
          onPress={() => linkedHabits.length > 0 && setShowLinked(v => !v)}
          activeOpacity={linkedHabits.length > 0 ? 0.7 : 1}
          accessibilityRole="button"
          accessibilityLabel={linked.length > 0 ? t('challenges.card.linkedA11y', { count: linked.length }) : t('challenges.card.noneLinked')}
          accessibilityState={{ expanded: showLinked, disabled: linkedHabits.length === 0 }}
        >
          <Text style={[styles.linkedTitle, { color: theme.textSecondary }]}>
            {linked.length > 0 ? t('challenges.card.linkedHabits', { count: linked.length }) : t('challenges.card.noneLinked')}
          </Text>
          {linkedHabits.length > 0 && (
            <Text style={[styles.linkedChevron, { color: theme.textSecondary }]}>
              {showLinked ? ' ▲' : ' ▼'}
            </Text>
          )}
        </TouchableOpacity>
        {showLinked && linkedHabits.length > 0 && (
          <View style={styles.linkedPills}>
            {linkedHabits.map(h => (
              <View key={h.id} style={[styles.linkedPill, { backgroundColor: theme.selection }]}>
                <Text style={styles.linkedPillIcon}>{h.icon || '⭐'}</Text>
                <Text style={[styles.linkedPillText, { color: theme.onSelection }]} numberOfLines={1}>{h.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Today status */}
      <View style={[styles.todayStatus, { borderTopColor: theme.border }]}>
        {todayDone ? (
          <Text style={[styles.claimDoneText, { color: theme.success }]}>{t('challenges.card.todayLogged')}</Text>
        ) : linked.length === 0 ? (
          <Text style={[styles.claimWaiting, { color: theme.textSecondary }]}>
            {t('challenges.card.tapEdit')}
          </Text>
        ) : (
          <Text style={[styles.claimWaiting, { color: theme.textSecondary }]}>
            {t('challenges.card.completeLinked')}
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
  useLocale();
  const today = todayStr();

  const [celebrating, setCelebrating] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState(null);
  const [selectedPast, setSelectedPast] = useState(null);

  const anyModalOpen = formVisible || !!selectedPast;
  useEffect(() => { setModalOpen(anyModalOpen); }, [anyModalOpen]);

  const handleDelete = (challenge) => {
    if (settings.hapticsEnabled) lightImpact();
    Alert.alert(t('challenges.delete.title'), t('challenges.delete.body', { name: challenge.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteChallenge(challenge.id) },
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
          <Text style={[styles.heading, { color: theme.text }]}>{t('challenges.title')}</Text>
          {canAddMore && (
            <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.action }]} onPress={openNew} accessibilityRole="button" accessibilityLabel={t('challenges.newA11y')}>
              <Text style={[styles.newBtnText, { color: theme.onAction }]}>{t('challenges.new')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {effectiveChallenges.length === 0 ? (
          <EmptyCard
            emoji="🏆"
            title={t('challenges.empty.title')}
            body={t('challenges.empty.body')}
            theme={theme}
            style={{ backgroundColor: theme.surface, borderWidth: 1, marginTop: 0 }}
          >
            <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: theme.action }]} onPress={openNew} accessibilityRole="button">
              <Text style={[styles.emptyBtnText, { color: theme.onAction }]}>{t('challenges.empty.create')}</Text>
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
          <View style={[styles.card, { backgroundColor: theme.brandSurface, borderColor: theme.border }]}>
            <Text style={[styles.tipTitle, { color: theme.link }]}>{t('challenges.tip.title')}</Text>
            <Text style={[styles.tipBody, { color: theme.text }]}>
              {t('challenges.tip.body')}
            </Text>
          </View>
        )}

        {/* Past Challenges */}
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{t('challenges.past')}</Text>
          {effectivePastChallenges.length === 0 ? (
            <View style={[styles.pastEmptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.pastEmptyText, { color: theme.textSecondary }]}>
                {t('challenges.pastEmpty')}
              </Text>
            </View>
          ) : (
            effectivePastChallenges.map((ch, i) => {
              const tier = ch.tier || getChallengeTier(ch.completedDays?.length ?? 0, ch.days);
              const ts = TIER_STYLES[tier];
              const cardBg = ts.bg || theme.surface;
              const cardBorder = ts.border || theme.border;
              const nameColor = ts.text || theme.text;
              const subColor = ts.text || theme.textSecondary;
              return (
                <TouchableOpacity
                  key={ch.id ?? i}
                  style={[styles.pastRow, { backgroundColor: cardBg, borderColor: cardBorder }]}
                  onPress={() => setSelectedPast(ch)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={tier !== 'none'
                    ? t('challenges.pastA11yTier', { name: ch.name, tier: tierLabel(tier), done: ch.completedDays?.length ?? 0, days: ch.days })
                    : t('challenges.pastA11yEnded', { name: ch.name, done: ch.completedDays?.length ?? 0, days: ch.days })}
                >
                  <Text style={styles.pastEmoji}>{ts.trophy}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pastName, { color: nameColor }]}>{ch.name}</Text>
                    <Text style={[styles.pastSub, { color: subColor }]}>
                      {tier !== 'none'
                        ? t('challenges.pastSubTier', { done: ch.completedDays?.length ?? 0, days: ch.days, tier: tierLabel(tier) })
                        : t('challenges.pastSubEnded', { done: ch.completedDays?.length ?? 0, days: ch.days })}
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
  newBtnText: { fontWeight: '700', fontSize: 15 },
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
  emptyBtnText: { fontWeight: '700', fontSize: 15 },
  tipTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  tipBody: { fontSize: 14, lineHeight: 20 },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  pastEmptyCard: { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 20, alignItems: 'center', marginBottom: 10 },
  pastEmptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  pastEmoji: { fontSize: 24 },
  pastName: { fontSize: 15, fontWeight: '600' },
  pastSub: { fontSize: 12, marginTop: 2 },
  completeBanner: { borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 16 },
  completeBannerText: { fontSize: 16, fontWeight: '700' },
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
  habitLinkCheckMark: { fontSize: 12, fontWeight: 'bold' },
  linkWarningRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  linkWarning: { flex: 1, fontSize: 13, fontStyle: 'italic' },
  addHabitInModalBtn: { borderWidth: 1.5, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 16, borderStyle: 'dashed' },
  addHabitInModalText: { fontSize: 15, fontWeight: '700' },
  templateChip: { width: 96, borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  templateEmoji: { fontSize: 22 },
  templateDays: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  templateName: { fontSize: 10, marginTop: 2 },
  // Icon picker
  iconPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  iconPickerBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  iconPickerEmoji: { fontSize: 22 },
  // Sheet / modal styles
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject },
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
  saveBtnText: { fontSize: 16, fontWeight: '700' },
});
