import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth, AUTH_CANCELLED } from '../context/AuthContext';
import { t, useLocale } from '../i18n';

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
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{t('linkAccount.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={[styles.closeTxt, { color: theme.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            {t('linkAccount.body')}
          </Text>

          {Platform.OS === 'ios' && appleAvailable && (
            busy === 'apple' ? (
              <View style={[styles.socialBtn, { backgroundColor: '#000' }]}><ActivityIndicator color="#fff" /></View>
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
            <Text style={[styles.dividerText, { color: theme.textMuted }]}>{t('linkAccount.orEmail')}</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <TextInput style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder={t('linkAccount.namePlaceholder')} placeholderTextColor={theme.textMuted} value={name} onChangeText={setName} maxLength={40} accessibilityLabel={t('linkAccount.nameA11y')} />
          <TextInput style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder={t('linkAccount.emailPlaceholder')} placeholderTextColor={theme.textMuted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} accessibilityLabel={t('linkAccount.emailPlaceholder')} />
          <TextInput style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder={t('linkAccount.passwordPlaceholder')} placeholderTextColor={theme.textMuted} value={password} onChangeText={setPassword} secureTextEntry accessibilityLabel={t('auth.password')} />
          {!!error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }]}
            onPress={submitEmail}
            disabled={!!busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!busy, busy: busy === 'email' }}
          >
            {busy === 'email' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('linkAccount.create')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  closeTxt: { fontSize: 20, fontWeight: 'bold' },
  body: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 14 },
  socialBtn: { height: 48, borderRadius: 12, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  googleBtn: { flexDirection: 'row', gap: 8, borderWidth: 1 },
  googleText: { fontSize: 15, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 6 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 10, fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginTop: 10 },
  error: { fontSize: 13, marginTop: 8 },
  btn: { marginTop: 14, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
