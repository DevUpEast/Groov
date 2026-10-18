import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from './ui/Button';
import { radius, space } from '../theme/tokens';
import { type as typeScale } from '../theme/typography';
import { useMotion } from '../theme/motion';
import { announce } from '../utils/a11y';
import { parseDateKey, addDays } from '../utils/dates';
import { t, getLocale, useLocale } from '../i18n';

// What the card says (C-09, plan §1.3 copy and tone rules: "holds", no loss words, the
// present and the next action). `news` is AppContext's streakNews:
// { kind: 'freeze', covered, count, streak, date } or { kind: 'reset', ended, date }.
export function streakNewsText(news) {
  if (!news) return '';
  if (news.kind === 'reset') return t('today.streakNews.reset', { count: news.ended });
  if (news.count > 1) return t('today.streakNews.freezeMany', { days: news.count, count: news.streak });
  if (news.covered === addDays(news.date, -1)) return t('today.streakNews.freezeYesterday', { count: news.streak });
  const day = parseDateKey(news.covered).toLocaleDateString(getLocale(), { weekday: 'long' });
  return t('today.streakNews.freezeDay', { day, count: news.streak });
}

/**
 * The one-time Today card for a freeze that covered a day or a streak that ended (C-09).
 * It sits above the first habit card on `brandSurface`, like the other informational cards,
 * and fades in (a shorter fade under reduced motion). A screen reader hears it once when it
 * appears. A freeze card has "Got it"; a reset card has "Start today's first habit", which
 * dismisses it so the first habit sits where the card was (and "Got it" on a day with nothing
 * scheduled).
 */
export default function StreakNewsCard({ news, theme, onDismiss, canStart = true }) {
  useLocale();
  const m = useMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const text = streakNewsText(news);
  useEffect(() => {
    m.timing(opacity, { toValue: 1, duration: m.duration.enter, easing: m.easing.emphasizedDecel }).start();
    announce(text);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = news.kind === 'reset';
  return (
    <Animated.View
      testID={`streak-news-${news.kind}`}
      style={[styles.card, { backgroundColor: theme.brandSurface, borderColor: theme.border, opacity }]}
    >
      <Ionicons
        name={reset ? 'sunny-outline' : 'snow-outline'}
        size={18}
        color={reset ? theme.link : theme.textSecondary}
      />
      <View style={styles.body}>
        <Text style={[styles.text, { color: theme.text }]}>{text}</Text>
        <Button
          variant="tertiary"
          size="sm"
          label={reset && canStart ? t('today.streakNews.start') : t('common.gotIt')}
          onPress={onDismiss}
          style={styles.btn}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.sm,
    borderWidth: 1, borderRadius: radius.card, paddingLeft: space.md, paddingRight: space.sm,
    paddingTop: space.sm, paddingBottom: space.xxs, marginTop: space.md,
  },
  body: { flex: 1 },
  text: { ...typeScale.callout },
  btn: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
