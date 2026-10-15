import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { getChallengeTier, TIER_STYLES } from '../context/AppContext';

const TIER_MESSAGES = {
  platinum: {
    headline: '🎉 Absolutely Flawless!',
    body: 'You showed up every single day without fail. That\'s rare. That\'s powerful. That discipline is yours to keep. Carry it into what comes next.',
  },
  gold: {
    headline: '🏆 Outstanding Work!',
    body: 'You pushed through nearly every day. Gold is earned, not given, and you earned it. Keep building on that momentum.',
  },
  silver: {
    headline: '🥈 Solid Effort!',
    body: 'More than halfway there. Silver means you showed up when it counted. Use this as your foundation and push harder next time.',
  },
  copper: {
    headline: 'A Start Worth Building On',
    body: 'Getting started is step one, but consistency is the real goal. Next time, pick one day at a time and commit to showing up. You have more in you than this challenge showed.',
  },
  none: {
    headline: 'This One Got Away',
    body: 'No days logged this time, and that\'s okay. Every stumble is information. Take a moment to honestly ask what got in the way, then come back focused and ready.',
  },
};

function ChallengeResultCard({ challenge, theme }) {
  const tier = challenge.tier || getChallengeTier(challenge.completedDays?.length ?? 0, challenge.days);
  const ts = TIER_STYLES[tier];
  const msg = TIER_MESSAGES[tier];
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
              {ts.badge} {tier.charAt(0).toUpperCase() + tier.slice(1)} Completion
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.progressBg, { backgroundColor: (border || theme.border) + '40' }]}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: border || theme.primary }]} />
      </View>
      <Text style={[styles.progressText, { color: textColor }]}>
        {completedCount} of {challenge.days} days completed ({Math.round(progress * 100)}%)
      </Text>

      <Text style={[styles.headline, { color: textColor }]}>{msg.headline}</Text>
      <Text style={[styles.body, { color: textColor }]}>{msg.body}</Text>
    </View>
  );
}

export default function ChallengeRewardModal({ challenges, onDismiss, theme }) {
  const [page, setPage] = useState(0);

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
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Challenge Complete</Text>
          {isMulti && (
            <Text style={styles.pageIndicator}>{page + 1} of {challenges.length}</Text>
          )}

          <ChallengeResultCard challenge={current} theme={theme} />

          <TouchableOpacity
            style={[styles.dismissBtn, { backgroundColor: theme.primary }]}
            onPress={handleNext}
            accessibilityRole="button"
          >
            <Text style={styles.dismissBtnText}>
              {isLast ? 'Got It' : 'Next →'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
  },
  container: {
    padding: 24,
    paddingBottom: 40,
    justifyContent: 'center',
    flexGrow: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
    color: '#fff',
  },
  pageIndicator: {
    fontSize: 13,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 16,
  },
  card: {
    borderRadius: 18,
    borderWidth: 2,
    padding: 20,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  trophyEmoji: { fontSize: 40 },
  challengeName: { fontSize: 18, fontWeight: 'bold', marginBottom: 2 },
  tierLabel: { fontSize: 13, fontWeight: '600' },
  progressBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: 8, borderRadius: 4 },
  progressText: { fontSize: 12, marginBottom: 16 },
  headline: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 22 },
  dismissBtn: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  dismissBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
