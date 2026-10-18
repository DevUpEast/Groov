import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getChallengeTier, TIER_STYLES } from '../context/AppContext';
import { t, useLocale } from '../i18n';
import OverlayModal from './ui/OverlayModal';
import { space, radius } from '../theme/tokens';

function ChallengeResultCard({ challenge, theme }) {
  const tier = challenge.tier || getChallengeTier(challenge.completedDays?.length ?? 0, challenge.days);
  const ts = TIER_STYLES[tier];
  const msg = { headline: t(`rewardModal.tiers.${tier}.headline`), body: t(`rewardModal.tiers.${tier}.body`) };
  const bg = ts.bg || theme.surface;
  const border = ts.border || theme.border;
  const textColor = ts.text || theme.text;
  const completedCount = challenge.completedDays?.length ?? 0;
  const progress = challenge.days > 0 ? completedCount / challenge.days : 0;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.trophyEmoji}>{ts.trophy}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.challengeName, { color: textColor }]}>{challenge.name}</Text>
          {tier !== 'none' && (
            <Text style={[styles.tierLabel, { color: textColor }]}>
              {t('rewardModal.completion', { badge: ts.badge, tier: t(`tier.${tier}`) })}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.progressBg, { backgroundColor: (border || theme.border) + '40' }]}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: border || theme.meter }]} />
      </View>
      <Text style={[styles.progressText, { color: textColor }]}>
        {t('rewardModal.progress', { done: completedCount, days: challenge.days, percent: Math.round(progress * 100) })}
      </Text>

      <Text style={[styles.headline, { color: textColor }]}>{msg.headline}</Text>
      <Text style={[styles.body, { color: textColor }]}>{msg.body}</Text>
    </View>
  );
}

export default function ChallengeRewardModal({ challenges, onDismiss, theme }) {
  const [page, setPage] = useState(0);
  useLocale();
  // The Modal draws under the translucent status and navigation bars (F-10): keep the content
  // clear of them.
  const insets = useSafeAreaInsets();

  if (!challenges || challenges.length === 0) return null;

  const isMulti = challenges.length > 1;
  const current = challenges[page];
  const isLast = page >= challenges.length - 1;

  const handleNext = () => {
    if (isLast) {
      onDismiss();
    } else {
      setPage(p => p + 1);
    }
  };

  return (
    <OverlayModal visible transparent heavyScrim animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onDismiss}>
      <View style={[styles.overlay, { backgroundColor: theme.celebrationScrim }]}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: space.lg + insets.top, paddingBottom: space.xl + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: theme.onCelebration }]}>{t('rewardModal.title')}</Text>
          {isMulti && (
            <Text style={[styles.pageIndicator, { color: theme.onCelebrationSecondary }]}>{t('rewardModal.page', { page: page + 1, total: challenges.length })}</Text>
          )}

          <ChallengeResultCard challenge={current} theme={theme} />

          <TouchableOpacity
            style={[styles.dismissBtn, { backgroundColor: theme.action }]}
            onPress={handleNext}
            accessibilityRole="button"
          >
            <Text style={[styles.dismissBtnText, { color: theme.onAction }]}>
              {isLast ? t('rewardModal.gotIt') : t('rewardModal.next')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
  },
  container: {
    padding: space.lg,
    justifyContent: 'center',
    flexGrow: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: space.xxs,
  },
  pageIndicator: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: space.md,
  },
  card: {
    borderRadius: radius.sheet,
    borderWidth: 2,
    padding: 20,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
  },
  trophyEmoji: { fontSize: 40 },
  challengeName: { fontSize: 18, fontWeight: 'bold', marginBottom: 2 },
  tierLabel: { fontSize: 13, fontWeight: '600' },
  progressBg: { height: 8, borderRadius: radius.cell, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: 8, borderRadius: radius.cell },
  progressText: { fontSize: 12, marginBottom: space.md },
  headline: { fontSize: 17, fontWeight: '700', marginBottom: space.xs },
  body: { fontSize: 14, lineHeight: 22 },
  dismissBtn: {
    borderRadius: radius.card,
    padding: space.md,
    alignItems: 'center',
  },
  dismissBtnText: { fontSize: 16, fontWeight: '700' },
});
