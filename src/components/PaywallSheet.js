import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { PLANS, PRO_FEATURES, purchasePlan, restorePurchases, purchasesConfigured } from '../services/entitlements';
import feedback, { EVENTS } from '../services/feedback';
import { track, Events } from '../utils/analytics';
import { t, useLocale } from '../i18n';
import { space, radius } from '../theme/tokens';
import Sheet from './ui/Sheet';

const TERMS_URL = 'https://isaaceast.com/groov/terms';
const PRIVACY_URL = 'https://isaaceast.com/groov/privacy-policy';

// Soft paywall: shown when a free-tier limit is hit or from Settings. Never blocks
// existing data; the user can always dismiss it. A `Sheet` (F-10) that opens at `medium`; the
// buy button is its pinned footer, so it is on screen at either detent.
export default function PaywallSheet({ visible, reason: reasonProp, onClose, onUnlocked, theme }) {
  const [plan, setPlan] = useState('yearly');
  const [busy, setBusy] = useState(null); // 'buy' | 'restore'
  const [error, setError] = useState('');
  useLocale();
  // The host clears the reason as it closes; keep the last one for the exit.
  const lastReason = useRef(reasonProp);
  if (visible) lastReason.current = reasonProp;
  const reason = visible ? reasonProp : lastReason.current;

  useEffect(() => { if (visible) { setError(''); track(Events.PAYWALL_VIEWED, { reason: reason || 'settings' }); } }, [visible, reason]);

  const buy = async () => {
    if (busy) return;
    setBusy('buy'); setError('');
    try {
      const res = await purchasePlan(plan);
      if (res.ok) { onUnlocked?.(); onClose(); }
      else if (!res.cancelled) { feedback.play(EVENTS.error); setError(t('paywall.errors.incomplete')); }
    } catch (e) {
      if (e?.code !== 'not_configured') feedback.play(EVENTS.error);
      setError(e?.code === 'not_configured'
        ? t('paywall.errors.comingSoon')
        : (e?.message || t('paywall.errors.failed')));
    } finally { setBusy(null); }
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore'); setError('');
    try {
      const ok = await restorePurchases();
      if (ok) { onUnlocked?.(); onClose(); } else setError(t('paywall.errors.noPurchase'));
    } catch (e) { feedback.play(EVENTS.error); setError(e?.message || t('paywall.errors.restoreFailed')); }
    finally { setBusy(null); }
  };

  const reasonLine = t(`paywall.reason.${['habits', 'reminders', 'ai'].includes(reason) ? reason : 'default'}`);

  const footer = (
    <>
      {!!error && <Text style={[styles.error, { color: theme.dangerText }]}>{error}</Text>}
      <TouchableOpacity style={[styles.cta, { backgroundColor: theme.action, opacity: busy ? 0.6 : 1 }]} onPress={buy} disabled={!!busy} accessibilityRole="button" accessibilityState={{ busy: busy === 'buy' }}>
        {busy === 'buy' ? <ActivityIndicator color={theme.onAction} /> : <Text style={[styles.ctaText, { color: theme.onAction }]}>{plan === 'yearly' ? t('paywall.trial') : t('paywall.buyLifetime')}</Text>}
      </TouchableOpacity>
    </>
  );

  return (
    <Sheet
      visible={!!visible}
      onClose={onClose}
      title={t('paywall.title')}
      closeLabel={t('common.notNow')}
      detents={['medium', 'large']}
      footer={footer}
      theme={theme}
      testID="paywall-sheet"
    >
      <Text style={[styles.reason, { color: theme.textSecondary }]}>{reasonLine}</Text>
      <View style={styles.features}>
        {PRO_FEATURES.map(f => (
          <View key={f.text} style={styles.feature}>
            <Text style={styles.featureEmoji}>{f.emoji}</Text>
            <Text style={[styles.featureText, { color: theme.text }]}>{f.text}</Text>
          </View>
        ))}
      </View>
      <View style={styles.plans}>
        {PLANS.map(p => {
          const on = plan === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.plan, { borderColor: on ? theme.selectionBorder : theme.controlBorder, backgroundColor: on ? theme.selection : theme.bg }]}
              onPress={() => { feedback.play(EVENTS.selection); setPlan(p.id); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={t('paywall.planA11y', { title: p.title, price: p.price })}
            >
              {p.badge ? <View style={[styles.badge, { backgroundColor: theme.action }]}><Text style={[styles.badgeText, { color: theme.onAction }]}>{p.badge}</Text></View> : null}
              <Text style={[styles.planTitle, { color: on ? theme.onSelection : theme.text }]}>{p.title}</Text>
              <Text style={[styles.planPrice, { color: on ? theme.onSelection : theme.link }]}>{p.price}</Text>
              <Text style={[styles.planNote, { color: theme.textSecondary }]}>{p.note}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.footer}>
        <TouchableOpacity onPress={restore} disabled={!!busy} accessibilityRole="button"><Text style={[styles.link, { color: theme.textSecondary }]}>{busy === 'restore' ? t('paywall.restoring') : t('paywall.restore')}</Text></TouchableOpacity>
        <Text style={[styles.dot, { color: theme.textSecondary }]}>·</Text>
        <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} accessibilityRole="link"><Text style={[styles.link, { color: theme.textSecondary }]}>{t('paywall.terms')}</Text></TouchableOpacity>
        <Text style={[styles.dot, { color: theme.textSecondary }]}>·</Text>
        <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} accessibilityRole="link"><Text style={[styles.link, { color: theme.textSecondary }]}>{t('paywall.privacy')}</Text></TouchableOpacity>
      </View>
      <Text style={[styles.legal, { color: theme.textSecondary }]}>
        {purchasesConfigured
          ? t('paywall.legalLive')
          : t('paywall.legalNotLive')}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reason: { fontSize: 14, lineHeight: 20, marginTop: space.xxs, marginBottom: 14 },
  features: { gap: space.xs, marginBottom: space.md },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureEmoji: { fontSize: 18, width: 26, textAlign: 'center' },
  featureText: { fontSize: 14, flex: 1 },
  plans: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  plan: { flex: 1, borderWidth: 2, borderRadius: radius.card, padding: 14, alignItems: 'center' },
  badge: { borderRadius: radius.control, paddingHorizontal: space.xs, paddingVertical: 2, marginBottom: 6 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  planTitle: { fontSize: 15, fontWeight: '700' },
  planPrice: { fontSize: 16, fontWeight: '800', marginTop: space.xxs },
  planNote: { fontSize: 12, marginTop: space.xxs, textAlign: 'center' },
  error: { fontSize: 13, marginBottom: 10 },
  cta: { paddingVertical: 15, borderRadius: radius.card, alignItems: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.xs },
  link: { fontSize: 13, fontWeight: '600' },
  dot: { fontSize: 13 },
  legal: { fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 10, marginBottom: space.sm },
});
