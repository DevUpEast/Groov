import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, Linking } from 'react-native';
import { PLANS, PRO_FEATURES, purchasePlan, restorePurchases, purchasesConfigured } from '../services/entitlements';
import { lightImpact, mediumImpact } from '../utils/haptics';
import { track, Events } from '../utils/analytics';

const TERMS_URL = 'https://isaaceast.com/groov/terms';
const PRIVACY_URL = 'https://isaaceast.com/groov/privacy-policy';

// Soft paywall: shown when a free-tier limit is hit or from Settings. Never blocks
// existing data; the user can always dismiss it.
export default function PaywallSheet({ visible, reason, onClose, onUnlocked, theme }) {
  const [plan, setPlan] = useState('yearly');
  const [busy, setBusy] = useState(null); // 'buy' | 'restore'
  const [error, setError] = useState('');

  useEffect(() => { if (visible) { setError(''); track(Events.PAYWALL_VIEWED, { reason: reason || 'settings' }); } }, [visible, reason]);
  if (!visible) return null;

  const buy = async () => {
    if (busy) return;
    setBusy('buy'); setError('');
    try {
      if (mediumImpact) mediumImpact();
      const res = await purchasePlan(plan);
      if (res.ok) { onUnlocked?.(); onClose(); }
      else if (!res.cancelled) setError('The purchase did not complete.');
    } catch (e) {
      setError(e?.code === 'not_configured'
        ? 'Groov Pro is coming soon. You can keep using everything in the free tier for now.'
        : (e?.message || 'Purchase failed. Please try again.'));
    } finally { setBusy(null); }
  };

  const restore = async () => {
    if (busy) return;
    setBusy('restore'); setError('');
    try {
      const ok = await restorePurchases();
      if (ok) { onUnlocked?.(); onClose(); } else setError('No previous purchase found for this account.');
    } catch (e) { setError(e?.message || 'Restore failed.'); }
    finally { setBusy(null); }
  };

  const reasonLine = {
    habits: 'You have reached the free limit of habits.',
    reminders: 'More than one daily reminder is a Pro feature.',
    ai: 'You have used today\'s free AI coaching.',
  }[reason] || 'Support a one-person app and unlock a little more.';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Groov Pro</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Not now">
              <Text style={[styles.closeTxt, { color: theme.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.reason, { color: theme.textMuted }]}>{reasonLine}</Text>
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
                    style={[styles.plan, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryLight : theme.bg }]}
                    onPress={() => { lightImpact(); setPlan(p.id); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, checked: on }}
                    accessibilityLabel={`${p.title}, ${p.price}`}
                  >
                    {p.badge ? <View style={[styles.badge, { backgroundColor: theme.primary }]}><Text style={styles.badgeText}>{p.badge}</Text></View> : null}
                    <Text style={[styles.planTitle, { color: theme.text }]}>{p.title}</Text>
                    <Text style={[styles.planPrice, { color: theme.primary }]}>{p.price}</Text>
                    <Text style={[styles.planNote, { color: theme.textMuted }]}>{p.note}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!!error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
            <TouchableOpacity style={[styles.cta, { backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }]} onPress={buy} disabled={!!busy} accessibilityRole="button" accessibilityState={{ busy: busy === 'buy' }}>
              {busy === 'buy' ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{plan === 'yearly' ? 'Start 7-day free trial' : 'Buy lifetime'}</Text>}
            </TouchableOpacity>
            <View style={styles.footer}>
              <TouchableOpacity onPress={restore} disabled={!!busy} accessibilityRole="button"><Text style={[styles.link, { color: theme.textMuted }]}>{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text></TouchableOpacity>
              <Text style={[styles.dot, { color: theme.textMuted }]}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL).catch(() => {})} accessibilityRole="link"><Text style={[styles.link, { color: theme.textMuted }]}>Terms</Text></TouchableOpacity>
              <Text style={[styles.dot, { color: theme.textMuted }]}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} accessibilityRole="link"><Text style={[styles.link, { color: theme.textMuted }]}>Privacy</Text></TouchableOpacity>
            </View>
            <Text style={[styles.legal, { color: theme.textMuted }]}>
              {purchasesConfigured
                ? 'Yearly renews automatically until cancelled in your store account settings. Prices shown are in USD and may vary by region.'
                : 'Purchases are not live in this build yet. Nothing will be charged.'}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  closeTxt: { fontSize: 20, fontWeight: 'bold' },
  reason: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  features: { gap: 8, marginBottom: 16 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureEmoji: { fontSize: 18, width: 26, textAlign: 'center' },
  featureText: { fontSize: 14, flex: 1 },
  plans: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  plan: { flex: 1, borderWidth: 2, borderRadius: 14, padding: 14, alignItems: 'center' },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  planTitle: { fontSize: 15, fontWeight: '700' },
  planPrice: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  planNote: { fontSize: 11, marginTop: 4, textAlign: 'center' },
  error: { fontSize: 13, marginBottom: 10 },
  cta: { paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 },
  link: { fontSize: 13, fontWeight: '600' },
  dot: { fontSize: 13 },
  legal: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 10 },
});
