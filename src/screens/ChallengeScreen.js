import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAreaView from '../components/SafeAreaView';
import { useApp, getChallengeTier, TIER_STYLES } from '../context/AppContext';
import Slider from '../components/Slider';
import EmptyCard from '../components/EmptyCard';
import feedback, { EVENTS } from '../services/feedback';
import { addDays } from '../utils/dates';
import { challengeFormDirty, currentChallengeDay, isChallengeExpired } from '../utils/challenges';
import { getChallengeTemplates } from '../utils/habits';
import { t, getLocale, useLocale } from '../i18n';
import AppText from '../components/ui/AppText';
import SectionLabel from '../components/ui/SectionLabel';
import SegmentedControl from '../components/ui/SegmentedControl';
import TextField from '../components/ui/TextField';
import Sheet from '../components/ui/Sheet';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import { numeric } from '../theme/typography';
import { space, radius } from '../theme/tokens';
import { useSnackbar, useSnackbarInset } from '../components/ui/Snackbar';

const RANGE_OPTIONS = [
  { key: 'week', max: 7 },
  { key: 'month', max: 30 },
  { key: 'year', max: 365 },
];

const tierLabel = (tier) => t(`tier.${tier}`);

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

export function ChallengeFormModal({ visible, initial, habits, onClose, onSave, onAddHabit, theme }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(7);
  const [rangeMax, setRangeMax] = useState(7);
  const [icon, setIcon] = useState('🏆');
  const [selectedHabitIds, setSelectedHabitIds] = useState([]);
  const templates = getChallengeTemplates();
  // The values the form opened with, for the dirty guard (F-09b).
  const [opened, setOpened] = useState(null);
  // The Sheet's guarded close, for "Add a new habit" (F-09b review M1).
  const sheetRef = useRef(null);

  useEffect(() => {
    if (visible) {
      const start = {
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        icon: initial?.icon ?? '🏆',
        days: initial?.days ?? 7,
        linkedHabitIds: initial?.linkedHabitIds || [],
      };
      setOpened(start);
      setName(start.name);
      setDescription(start.description);
      setIcon(start.icon);
      setDays(start.days);
      setRangeMax(start.days <= 7 ? 7 : start.days <= 30 ? 30 : 365);
      setSelectedHabitIds(start.linkedHabitIds);
    }
  }, [visible]);

  const dirty = visible && !!opened
    && challengeFormDirty(opened, { name, description, icon, days, linkedHabitIds: selectedHabitIds });

  // Can only save if name is filled AND (no habits exist yet OR at least one is linked)
  const canSave = name.trim().length > 0 && (habits.length === 0 || selectedHabitIds.length > 0);

  const handleSave = () => {
    if (!canSave) { feedback.play(EVENTS.refused); return; }
    onSave({ name: name.trim(), description: description.trim(), days, icon, linkedHabitIds: selectedHabitIds });
    onClose();
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

  // ui/Sheet (F-09b): scrim, drag, back and close ask "Discard changes?" while the form is
  // dirty; Save is pinned in the footer above the keyboard.
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      ref={sheetRef}
      title={initial ? t('challenges.form.editTitle') : t('challenges.form.newTitle')}
      dirty={dirty}
      contentContainerStyle={styles.formBody}
      theme={theme}
      testID="challenge-form-sheet"
      footer={(
        <Button
          block
          label={initial ? t('challenges.form.saveChanges') : t('challenges.form.create')}
          accessibilityLabel={initial ? t('challenges.form.saveA11y') : t('challenges.form.createA11y')}
          onPress={handleSave}
          disabled={!canSave}
          testID="challenge-form-save"
        />
      )}
    >
        {!initial && (
          <>
            <SectionLabel label={t('challenges.form.template')} theme={theme} header={false} first style={styles.formLabel} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.md }} contentContainerStyle={{ gap: space.xs }}>
              {templates.map(tpl => {
                const active = days === tpl.days && name === tpl.name;
                return (
                  <TouchableOpacity
                    key={tpl.key}
                    style={[styles.templateChip, { borderColor: active ? theme.selectionBorder : theme.border, backgroundColor: active ? theme.selection : theme.bg }]}
                    onPress={() => {
                      feedback.play(EVENTS.selection);
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

        <SectionLabel label={t('challenges.form.icon')} theme={theme} header={false} first style={styles.formLabel} />
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

        <TextField
          theme={theme}
          label={t('challenges.form.name')}
          value={name}
          onChangeText={setName}
          accessibilityLabel={t('challenges.form.nameA11y')}
          placeholder={t('challenges.form.namePlaceholder')}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />

        <TextField
          theme={theme}
          label={t('challenges.form.description')}
          value={description}
          onChangeText={setDescription}
          accessibilityLabel={t('challenges.form.descriptionA11y')}
          placeholder={t('challenges.form.descriptionPlaceholder')}
          multiline
          numberOfLines={3}
        />

        <SectionLabel label={t('challenges.form.duration', { count: days })} theme={theme} header={false} first style={styles.formLabel} />

        <SegmentedControl
          theme={theme}
          fill
          style={styles.rangeRow}
          accessibilityLabel={t('challenges.form.durationA11y')}
          value={rangeMax}
          onChange={handleRangeChange}
          options={RANGE_OPTIONS.map(opt => ({
            value: opt.max,
            label: t(`challenges.form.range.${opt.key}`),
            accessibilityLabel: t('challenges.form.rangeA11y', { label: t(`challenges.form.range.${opt.key}`), max: opt.max }),
          }))}
        />

        <Slider value={days} min={1} max={rangeMax} onValueChange={setDays} theme={theme} label={t('challenges.form.durationA11y')} />

        <View style={styles.sliderLabels}>
          <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>1</Text>
          <Text style={[styles.sliderLabelText, { color: theme.textSecondary }]}>{rangeMax}</Text>
        </View>

        {/* ── Linked habits ── */}
        <SectionLabel label={t('challenges.form.linked')} theme={theme} header={false} first style={styles.formLabel} />

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
          // Leaving for Habits goes through the discard guard like any other close; the tab
          // change runs only once the sheet has really gone (never after "Keep editing").
          onPress={() => sheetRef.current?.requestClose(() => onAddHabit?.())}
          accessibilityRole="button"
          accessibilityLabel={t('challenges.form.addNewA11y')}
        >
          <Text style={[styles.addHabitInModalText, { color: theme.link }]}>{t('challenges.form.addNew')}</Text>
        </TouchableOpacity>
    </Sheet>
  );
}

// ── Past challenge detail modal ───────────────────────────────────────────────

function PastChallengeDetailModal({ challenge: challengeProp, onClose, theme }) {
  // The host clears the challenge as it closes; keep the last one on screen for the exit.
  const last = useRef(challengeProp);
  if (challengeProp) last.current = challengeProp;
  const challenge = challengeProp || last.current;
  if (!challenge) return null;

  const tier = challenge.tier || getChallengeTier(challenge.completedDays?.length ?? 0, challenge.days);
  const ts = TIER_STYLES[tier];
  const completedCount = challenge.completedDays?.length ?? 0;
  const progress = challenge.days > 0 ? completedCount / challenge.days : 0;
  const cardBg = ts.bg || theme.raised;
  const cardBorder = ts.border || theme.border;
  const textColor = ts.text || theme.text;
  const subColor = ts.text || theme.textSecondary;
  const title = `${ts.trophy} ${challenge.name}`;

  const header = ({ close, titleRef }) => (
    <View style={styles.sheetHeader}>
      <AppText ref={titleRef} variant="headline" style={[styles.sheetTitle, { color: textColor }]} accessibilityRole="header" numberOfLines={2}>
        {title}
      </AppText>
      <IconButton icon="close" iconSize={24} theme={theme} color={subColor} onPress={close} accessibilityLabel={t('common.close')} style={styles.sheetCloseBtn} />
    </View>
  );

  return (
    <Sheet
      visible={!!challengeProp}
      onClose={onClose}
      header={header}
      accessibilityLabel={challenge.name}
      backgroundColor={cardBg}
      grabberColor={ts.border || undefined}
      contentContainerStyle={styles.pastBody}
      theme={theme}
      testID="past-challenge-sheet"
    >
      {tier !== 'none' && (
        <View style={[styles.completeBanner, { backgroundColor: cardBorder }]}>
          <Text style={[styles.completeBannerText, { color: theme.onTier }]}>{t('challenges.detail.completion', { badge: ts.badge, tier: tierLabel(tier) })}</Text>
        </View>
      )}

      <Text style={[styles.pastDesc, { color: subColor }]}>{challenge.description || t('challenges.detail.noDescription')}</Text>

      <Text style={[styles.detailLabel, { color: subColor }]}>{t('challenges.detail.progress', { done: completedCount, days: challenge.days })}</Text>

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
    </Sheet>
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
    theme,
    editChallenge, createChallenge, deleteChallenge, pendingChallengeDeletes, holdChallengeDelete,
    setRequestedTab, setPendingHabitLinkChallenge,
    setModalOpen,
    todayStr,
  } = useApp();
  useLocale();
  const today = todayStr();
  // C-10: a confirmed delete ends in a Snackbar with Undo. Meanwhile AppContext holds the
  // challenge out of effectiveChallenges (so it is not claimed, completed, archived or shown on
  // Today); the delete runs when the snackbar goes without Undo (timeout, another snackbar, the
  // app backgrounding, Settings' flush before sign-out), never on a provider unmount.
  const snackbar = useSnackbar();
  const snackbarInset = useSnackbarInset();
  const live = useRef({});
  live.current = { deleteChallenge };
  const shownChallenges = effectiveChallenges;

  const [formVisible, setFormVisible] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState(null);
  const [selectedPast, setSelectedPast] = useState(null);

  const anyModalOpen = formVisible || !!selectedPast;
  useEffect(() => { setModalOpen(anyModalOpen); }, [anyModalOpen]);

  const handleDelete = (challenge) => {
    feedback.play(EVENTS.destructiveConfirm);
    Alert.alert(t('challenges.delete.title'), t('challenges.delete.body', { name: challenge.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteWithUndo(challenge) },
    ]);
  };

  const deleteWithUndo = (challenge) => {
    const { id } = challenge;
    holdChallengeDelete(id, true);
    snackbar.show({
      kind: 'delete',
      endsOnBackground: true,
      message: t('snackbar.deleted', { name: challenge.name }),
      actionLabel: t('common.undo'),
      onAction: () => holdChallengeDelete(id, false),
      // 'unmount': the provider is going away with a dead session; the challenge simply stays.
      onHide: (reason) => (reason === 'unmount' ? undefined : live.current.deleteChallenge(id)),
    });
  };

  const openNew = () => {
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

  // A challenge waiting out its delete Undo still holds its slot (Undo could bring it back).
  const canAddMore = effectiveChallenges.length + (pendingChallengeDeletes?.length || 0) < 3;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={[styles.scroll, snackbarInset > 0 && { paddingBottom: styles.scroll.paddingBottom + snackbarInset }]}>
        <View style={styles.headingRow}>
          <AppText variant="title" style={[styles.heading, { color: theme.text }]}>{t('challenges.title')}</AppText>
          {canAddMore && (
            <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.action }]} onPress={openNew} accessibilityRole="button" accessibilityLabel={t('challenges.newA11y')}>
              <Text style={[styles.newBtnText, { color: theme.onAction }]}>{t('challenges.new')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {shownChallenges.length === 0 ? (
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
          shownChallenges.map(challenge => (
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
        {shownChallenges.length > 0 && shownChallenges.length < 3 && effectivePastChallenges.length === 0 && (
          <View style={[styles.card, { backgroundColor: theme.brandSurface, borderColor: theme.border }]}>
            <Text style={[styles.tipTitle, { color: theme.link }]}>{t('challenges.tip.title')}</Text>
            <Text style={[styles.tipBody, { color: theme.text }]}>
              {t('challenges.tip.body')}
            </Text>
          </View>
        )}

        {/* Past Challenges */}
        <View style={{ marginTop: space.xs }}>
          <SectionLabel label={t('challenges.past')} theme={theme} first style={styles.sectionLabel} />
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
  scroll: { paddingHorizontal: space.gutter, paddingTop: space.lg, paddingBottom: 40 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  heading: {},
  newBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill },
  newBtnText: { fontWeight: '700', fontSize: 15 },
  sectionLabel: { marginBottom: space.xs },
  card: { borderRadius: radius.card, borderWidth: 1, padding: 20, marginBottom: space.lg },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md, gap: 10 },
  trophy: { fontSize: 32 },
  challengeInfo: { flex: 1 },
  challengeName: { fontSize: 17, fontWeight: 'bold' },
  challengeSub: { fontSize: 12, marginTop: 2 },
  editBtn: { padding: 6 },
  editBtnText: { fontSize: 13, fontWeight: '600' },
  deleteBtn: { padding: 6 },
  deleteBtnText: { fontSize: 16, fontWeight: 'bold' },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  badge: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: 'bold' },
  progressBg: { height: 8, borderRadius: radius.cell, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: 8, borderRadius: radius.cell },
  progressLabel: { fontSize: 12, marginBottom: space.xs, ...numeric },
  desc: { fontSize: 13, lineHeight: 18, marginBottom: space.xs },
  linkedSection: { borderTopWidth: 1, paddingTop: space.sm, marginTop: space.xxs },
  linkedTitleArea: { flexDirection: 'row', alignItems: 'center' },
  linkedTitle: { fontSize: 12, fontWeight: '600' },
  linkedChevron: { fontSize: 12, fontWeight: '700' },
  linkedPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.xs },
  linkedPill: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.control, paddingHorizontal: space.xs, paddingVertical: space.xxs, gap: space.xxs, maxWidth: 140 },
  linkedPillIcon: { fontSize: 14 },
  linkedPillText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  todayStatus: { borderTopWidth: 1, paddingTop: space.sm, marginTop: space.xs },
  claimDoneText: { fontSize: 15, fontWeight: '600' },
  claimWaiting: { fontSize: 13, lineHeight: 18 },
  emptyCard: { borderRadius: radius.card, borderWidth: 1, padding: 36, alignItems: 'center', borderStyle: 'dashed' },
  emptyEmoji: { fontSize: 44, marginBottom: space.sm },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: space.xs },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyBtn: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.pill },
  emptyBtnText: { fontWeight: '700', fontSize: 15 },
  tipTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  tipBody: { fontSize: 14, lineHeight: 20 },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.card, borderWidth: 1, padding: 14, marginBottom: space.xs },
  pastEmptyCard: { borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', padding: 20, alignItems: 'center', marginBottom: 10 },
  pastEmptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  pastEmoji: { fontSize: 24 },
  pastName: { fontSize: 15, fontWeight: '600' },
  pastSub: { fontSize: 12, marginTop: 2 },
  completeBanner: { borderRadius: radius.control, padding: space.sm, alignItems: 'center', marginBottom: space.md },
  completeBannerText: { fontSize: 16, fontWeight: '700' },
  pastDesc: { fontSize: 14, lineHeight: 20, marginBottom: space.md },
  pastMeta: { fontSize: 12, marginTop: space.sm },
  // Form & habit linking
  noHabitsInForm: { fontSize: 13, marginBottom: space.md, fontStyle: 'italic' },
  linkAllBtn: { borderWidth: 1.5, borderRadius: radius.card, padding: space.sm, alignItems: 'center', marginBottom: space.sm },
  linkAllBtnText: { fontSize: 15, fontWeight: '700' },
  habitLinkRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.card, borderWidth: 1.5, padding: space.sm, marginBottom: 10, gap: 10 },
  habitLinkIcon: { fontSize: 22 },
  habitLinkName: { flex: 1, fontSize: 15, fontWeight: '500' },
  habitLinkCheck: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  habitLinkCheckMark: { fontSize: 12, fontWeight: 'bold' },
  linkWarningRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  linkWarning: { flex: 1, fontSize: 13, fontStyle: 'italic' },
  addHabitInModalBtn: { borderWidth: 1.5, borderRadius: radius.card, padding: 14, alignItems: 'center', marginTop: space.xxs, marginBottom: space.md, borderStyle: 'dashed' },
  addHabitInModalText: { fontSize: 15, fontWeight: '700' },
  templateChip: { width: 96, borderWidth: 1.5, borderRadius: radius.control, paddingVertical: 10, paddingHorizontal: space.xs, alignItems: 'center' },
  templateEmoji: { fontSize: 22 },
  templateDays: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  templateName: { fontSize: 12, marginTop: 2 },
  // Icon picker
  iconPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: 20 },
  iconPickerBtn: { width: 44, height: 44, borderRadius: radius.control, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  iconPickerEmoji: { fontSize: 22 },
  // Past challenge sheet
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  sheetTitle: { flexShrink: 1 },
  // The 40 pt button's icon lines up with the sheet's content edge.
  sheetCloseBtn: { marginRight: -space.xs },
  // 8 dp under the header (Sheet dragZone) + 12 = the old 20 dp header gap.
  pastBody: { paddingTop: space.sm, paddingBottom: space.sm },
  formLabel: { marginBottom: space.xs },
  // 8 dp under the sheet's title row (Sheet dragZone) + 12 = the old 20 dp header gap.
  formBody: { paddingTop: space.sm, paddingBottom: space.xs },
  detailLabel: { fontSize: 13, fontWeight: '600', marginBottom: space.xs },
  rangeRow: { marginBottom: space.md },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.md, marginHorizontal: space.xxs },
  sliderLabelText: { fontSize: 12 },
});
