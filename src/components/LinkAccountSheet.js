import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth, AUTH_CANCELLED } from '../context/AuthContext';
import { t, useLocale } from '../i18n';
import { elevation, palette, space, radius } from '../theme/tokens';
import OverlayModal from './ui/OverlayModal';

// The native Apple button below is always the BLACK style, so its busy stand-in matches it.
const APPLE_BLACK = { bg: palette.light.appleButton, fg: palette.light.onAppleButton };

// Turns a guest (anonymous) account into a permanent one. Shown from Settings.
// Linking keeps the same user id, so nothing has to be migrated.
export default function LinkAccountSheet({ visible, onClose, onLinked, theme }) {
  const { linkEmail, linkWithGoogle, linkWithApple, appleAvailable, displayName } = useAuth();
  const [name, setName] = useState(displayName || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(null); // 'email' | 'google' | 'apple'
  const [error, setError] = useState('');
  useLocale();

  if (!visible) return null;

  const run = async (kind, fn) => {
    if (busy) return;
    setError('');
    setBusy(kind);
    try {
      await fn();
      onLinked?.(kind);
    } catch (e) {
      if (e?.code !== AUTH_CANCELLED) setError(e?.message || t('linkAccount.errors.failed'));
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = () => {
    if (!email.trim()) return setError(t('linkAccount.errors.enterEmail'));
    if (password.length < 8) return setError(t('linkAccount.errors.min8'));
    run('email', () => linkEmail(email, password, name));
  };

  return (
    <OverlayModal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.overlay, { backgroundColor: theme.scrim }]}>
        <View style={[styles.sheet, elevation.sheet, { backgroundColor: theme.raised, shadowColor: theme.shadow }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{t('linkAccount.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={[styles.closeTxt, { color: theme.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('linkAccount.body')}
          </Text>

          {Platform.OS === 'ios' && appleAvailable && (
            busy === 'apple' ? (
              <View style={[styles.socialBtn, { backgroundColor: APPLE_BLACK.bg }]}><ActivityIndicator color={APPLE_BLACK.fg} /></View>
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={styles.socialBtn}
                onPress={() => run('apple', linkWithApple)}
              />
            )
          )}
          <TouchableOpacity
            style={[styles.socialBtn, styles.googleBtn, { backgroundColor: theme.bg, borderColor: theme.border }]}
            onPress={() => run('google', linkWithGoogle)}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityLabel={t('linkAccount.google')}
          >
            {busy === 'google'
              ? <ActivityIndicator color={theme.text} />
              : <><Ionicons name="logo-google" size={18} color={theme.text} /><Text style={[styles.googleText, { color: theme.text }]}>{t('linkAccount.google')}</Text></>}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textSecondary }]}>{t('linkAccount.orEmail')}</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <TextInput style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder={t('linkAccount.namePlaceholder')} placeholderTextColor={theme.textSecondary} value={name} onChangeText={setName} maxLength={40} accessibilityLabel={t('linkAccount.nameA11y')} />
          <TextInput style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder={t('linkAccount.emailPlaceholder')} placeholderTextColor={theme.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} accessibilityLabel={t('linkAccount.emailPlaceholder')} />
          <TextInput style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder={t('linkAccount.passwordPlaceholder')} placeholderTextColor={theme.textSecondary} value={password} onChangeText={setPassword} secureTextEntry accessibilityLabel={t('auth.password')} />
          {!!error && <Text style={[styles.error, { color: theme.dangerText }]}>{error}</Text>}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.action, opacity: busy ? 0.6 : 1 }]}
            onPress={submitEmail}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!busy, busy: busy === 'email' }}
          >
            {busy === 'email' ? <ActivityIndicator color={theme.onAction} /> : <Text style={[styles.btnText, { color: theme.onAction }]}>{t('linkAccount.create')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.lg, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: 'bold' },
  closeBtn: { padding: space.xxs },
  closeTxt: { fontSize: 20, fontWeight: 'bold' },
  body: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 14 },
  socialBtn: { height: 48, borderRadius: radius.card, marginTop: space.xs, alignItems: 'center', justifyContent: 'center' },
  googleBtn: { flexDirection: 'row', gap: space.xs, borderWidth: 1 },
  googleText: { fontSize: 15, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 6 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 12 },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 14, paddingVertical: space.sm, fontSize: 15, marginTop: 10 },
  error: { fontSize: 13, marginTop: space.xs },
  btn: { marginTop: 14, paddingVertical: 14, borderRadius: radius.card, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
});
