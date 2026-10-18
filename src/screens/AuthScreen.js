import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  useColorScheme,
} from 'react-native';
import SafeAreaView from '../components/SafeAreaView';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth, AUTH_CANCELLED } from '../context/AuthContext';
import { themes } from '../theme/colors';
import { palette, space, radius } from '../theme/tokens';
import { t, useLocale } from '../i18n';

export default function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'reset'
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Password reset fields
  const [resetCode, setResetCode] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const {
    signIn, signUp, sendPasswordReset, verifyPasswordReset,
    signInWithApple, signInWithGoogle, appleAvailable, signInAnonymously,
  } = useAuth();
  const [socialLoading, setSocialLoading] = useState(null); // 'apple' | 'google' | null
  useLocale();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const theme = themes[isDark ? 'dark' : 'light'];

  const handleSocial = async (provider) => {
    if (loading || socialLoading) return;
    setError('');
    setSuccessMsg('');
    setSocialLoading(provider);
    try {
      if (provider === 'apple') await signInWithApple();
      else if (provider === 'guest') await signInAnonymously();
      else await signInWithGoogle();
      // On success onAuthStateChange swaps AuthScreen out for the app.
    } catch (e) {
      if (e?.code !== AUTH_CANCELLED) {
        setError(e?.message || t('auth.errors.socialFailed', { provider: provider === 'apple' ? t('auth.providers.apple') : t('auth.providers.google') }));
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccessMsg('');

    if (mode === 'register' && !displayName.trim()) {
      setError(t('auth.errors.displayNameRequired'));
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError(t('auth.errors.emailPasswordRequired'));
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError(t('auth.errors.mismatch'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.errors.min8'));
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        const data = await signUp(email.trim(), password, displayName.trim());
        if (data?.user && !data.session) {
          setSuccessMsg(t('auth.success.confirmEmail'));
          setMode('login');
        }
      }
    } catch (e) {
      setError(e.message || t('auth.errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setSuccessMsg('');
    setDisplayName('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setResetCode('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleForgotSend = async () => {
    setError('');
    setSuccessMsg('');
    if (!resetEmail.trim()) { setError(t('auth.errors.enterEmail')); return; }
    setLoading(true);
    try {
      await sendPasswordReset(resetEmail);
      setSuccessMsg(t('auth.success.codeSent', { email: resetEmail.trim() }));
      setMode('reset');
    } catch (e) {
      setError(e.message || t('auth.errors.sendFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetVerify = async () => {
    setError('');
    if (!resetCode.trim()) { setError(t('auth.errors.enterCode')); return; }
    if (!newPassword) { setError(t('auth.errors.enterNewPassword')); return; }
    if (newPassword.length < 8) { setError(t('auth.errors.min8')); return; }
    if (newPassword !== confirmNewPassword) { setError(t('auth.errors.mismatch')); return; }
    setLoading(true);
    try {
      await verifyPasswordReset(resetEmail, resetCode, newPassword);
      setSuccessMsg(t('auth.success.passwordUpdated'));
      switchMode('login');
    } catch (e) {
      setError(e.message || t('auth.errors.invalidCode'));
    } finally {
      setLoading(false);
    }
  };

  const tagline = t(`auth.tagline.${mode}`);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <View style={s.header}>
            <Text style={[s.logo, { color: theme.link }]}>Groov</Text>
            <Text style={[s.tagline, { color: theme.textSecondary }]}>{tagline}</Text>
          </View>

          <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>

            {/* Login / Register tabs — hidden during password reset flow */}
            {(mode === 'login' || mode === 'register') && (
              <View style={[s.tabs, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                {['login', 'register'].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[s.tab, mode === m && { backgroundColor: theme.selection, borderColor: theme.selectionBorder }]}
                    onPress={() => switchMode(m)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === m }}
                  >
                    <Text style={[s.tabText, { color: mode === m ? theme.onSelection : theme.textSecondary }]}>
                      {m === 'login' ? t('auth.login') : t('auth.register')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={s.fields}>
              {/* ── Forgot Password: enter email ── */}
              {mode === 'forgot' && (
                <>
                  <Text style={[s.label, { color: theme.textSecondary }]}>{t('auth.email')}</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    accessibilityLabel={t('auth.email')}
                    placeholder={t('auth.emailPlaceholder')}
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {!!error && <Text style={[s.msg, { color: theme.dangerText }]}>{error}</Text>}
                  {!!successMsg && <Text style={[s.msg, { color: theme.success }]}>{successMsg}</Text>}
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: theme.action }, loading && s.btnDisabled]}
                    onPress={handleForgotSend}
                    disabled={loading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.sendResetCode')}
                    accessibilityState={{ disabled: loading, busy: loading }}
                  >
                    {loading ? <ActivityIndicator color={theme.onAction} /> : <Text style={[s.btnText, { color: theme.onAction }]}>{t('auth.sendResetCode')}</Text>}
                  </TouchableOpacity>
                </>
              )}

              {/* ── Reset: enter code + new password ── */}
              {mode === 'reset' && (
                <>
                  {!!successMsg && <Text style={[s.msg, { color: theme.success, marginBottom: space.xs }]}>{successMsg}</Text>}
                  <Text style={[s.label, { color: theme.textSecondary }]}>{t('auth.resetCode')}</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={resetCode}
                    onChangeText={setResetCode}
                    accessibilityLabel={t('auth.resetCode')}
                    placeholder={t('auth.codePlaceholder')}
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[s.label, { color: theme.textSecondary }]}>{t('auth.newPassword')}</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    accessibilityLabel={t('auth.newPassword')}
                    placeholder="••••••••"
                    placeholderTextColor={theme.textSecondary}
                    secureTextEntry
                  />
                  <Text style={[s.label, { color: theme.textSecondary }]}>{t('auth.confirmNewPassword')}</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    accessibilityLabel={t('auth.confirmNewPassword')}
                    placeholder="••••••••"
                    placeholderTextColor={theme.textSecondary}
                    secureTextEntry
                  />
                  {!!error && <Text style={[s.msg, { color: theme.dangerText }]}>{error}</Text>}
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: theme.action }, loading && s.btnDisabled]}
                    onPress={handleResetVerify}
                    disabled={loading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.setNewPassword')}
                    accessibilityState={{ disabled: loading, busy: loading }}
                  >
                    {loading ? <ActivityIndicator color={theme.onAction} /> : <Text style={[s.btnText, { color: theme.onAction }]}>{t('auth.setNewPassword')}</Text>}
                  </TouchableOpacity>
                </>
              )}

              {/* ── Login / Register fields ── */}
              {(mode === 'login' || mode === 'register') && (
                <>
                  {mode === 'register' && (
                    <>
                      <Text style={[s.label, { color: theme.textSecondary }]}>{t('auth.displayName')}</Text>
                      <TextInput
                        style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                        value={displayName}
                        onChangeText={setDisplayName}
                        accessibilityLabel={t('auth.displayName')}
                        placeholder={t('auth.displayNamePlaceholder')}
                        placeholderTextColor={theme.textSecondary}
                        autoCapitalize="words"
                        autoCorrect={false}
                        maxLength={30}
                      />
                    </>
                  )}

                  <Text style={[s.label, { color: theme.textSecondary }]}>{t('auth.email')}</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={email}
                    onChangeText={setEmail}
                    accessibilityLabel={t('auth.email')}
                    placeholder={t('auth.emailPlaceholder')}
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={[s.label, { color: theme.textSecondary }]}>{t('auth.password')}</Text>
                  <View style={[s.inputWrapper, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                    <TextInput
                      style={[s.inputInner, { color: theme.text }]}
                      value={password}
                      onChangeText={setPassword}
                      accessibilityLabel={t('auth.password')}
                      placeholder="••••••••"
                      placeholderTextColor={theme.textSecondary}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(v => !v)}
                      style={s.eyeBtn}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    >
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {mode === 'register' && (
                    <>
                      <Text style={[s.label, { color: theme.textSecondary }]}>{t('auth.confirmPassword')}</Text>
                      <View style={[s.inputWrapper, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                        <TextInput
                          style={[s.inputInner, { color: theme.text }]}
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          accessibilityLabel={t('auth.confirmPassword')}
                          placeholder="••••••••"
                          placeholderTextColor={theme.textSecondary}
                          secureTextEntry={!showConfirmPassword}
                        />
                        <TouchableOpacity
                          onPress={() => setShowConfirmPassword(v => !v)}
                          style={s.eyeBtn}
                          activeOpacity={0.6}
                          accessibilityRole="button"
                          accessibilityLabel={showConfirmPassword ? t('auth.hideConfirmPassword') : t('auth.showConfirmPassword')}
                        >
                          <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {!!error && <Text style={[s.msg, { color: theme.dangerText }]}>{error}</Text>}
                  {!!successMsg && <Text style={[s.msg, { color: theme.success }]}>{successMsg}</Text>}

                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: theme.action }, loading && s.btnDisabled]}
                    onPress={handleSubmit}
                    disabled={loading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'login' ? t('auth.login') : t('auth.createAccount')}
                    accessibilityState={{ disabled: loading, busy: loading }}
                  >
                    {loading
                      ? <ActivityIndicator color={theme.onAction} />
                      : <Text style={[s.btnText, { color: theme.onAction }]}>{mode === 'login' ? t('auth.login') : t('auth.createAccount')}</Text>
                    }
                  </TouchableOpacity>

                  {mode === 'login' && (
                    <TouchableOpacity
                      style={s.forgotBtn}
                      onPress={() => { switchMode('forgot'); setResetEmail(email); }}
                      activeOpacity={0.7}
                      accessibilityRole="link"
                    >
                      <Text style={[s.forgotText, { color: theme.link }]}>{t('auth.forgotPassword')}</Text>
                    </TouchableOpacity>
                  )}

                  {/* ── Social sign-in ── */}
                  <View style={s.dividerRow}>
                    <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
                    <Text style={[s.dividerText, { color: theme.textSecondary }]}>{t('auth.orContinue')}</Text>
                    <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
                  </View>

                  {Platform.OS === 'ios' && appleAvailable && (
                    socialLoading === 'apple' ? (
                      <View style={[s.socialBtn, { backgroundColor: theme.appleButton }]}>
                        <ActivityIndicator color={theme.onAppleButton} />
                      </View>
                    ) : (
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonType={mode === 'register'
                          ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                          : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={isDark
                          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        cornerRadius={12}
                        style={s.socialBtn}
                        onPress={() => handleSocial('apple')}
                      />
                    )
                  )}

                  <TouchableOpacity
                    style={[s.socialBtn, s.googleBtn, { backgroundColor: theme.surface, borderColor: theme.border }, (loading || socialLoading) && s.btnDisabled]}
                    onPress={() => handleSocial('google')}
                    disabled={loading || !!socialLoading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'register' ? t('auth.googleSignUp') : t('auth.googleSignIn')}
                  >
                    {socialLoading === 'google'
                      ? <ActivityIndicator color={theme.text} />
                      : (
                        <>
                          <Ionicons name="logo-google" size={18} color={theme.text} style={s.googleIcon} />
                          <Text style={[s.googleText, { color: theme.text }]}>
                            {mode === 'register' ? t('auth.googleSignUp') : t('auth.googleSignIn')}
                          </Text>
                        </>
                      )}
                  </TouchableOpacity>

                  {/* Guest: start now, create the account later from Settings */}
                  <TouchableOpacity
                    style={s.guestBtn}
                    onPress={() => handleSocial('guest')}
                    disabled={loading || !!socialLoading}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('auth.guest')}
                  >
                    {socialLoading === 'guest'
                      ? <ActivityIndicator color={theme.link} />
                      : <Text style={[s.guestText, { color: theme.link }]}>{t('auth.guest')}</Text>}
                  </TouchableOpacity>
                  <Text style={[s.guestHint, { color: theme.textSecondary }]}>
                    {t('auth.guestHint')}
                  </Text>
                </>
              )}
            </View>
          </View>

          {(mode === 'login' || mode === 'register') && (
            <Text style={[s.footer, { color: theme.textSecondary }]}>
              {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}
              <Text style={{ color: theme.link }} onPress={() => switchMode(mode === 'login' ? 'register' : 'login')} accessibilityRole="link">
                {mode === 'login' ? t('auth.registerLink') : t('auth.loginLink')}
              </Text>
            </Text>
          )}

          {(mode === 'forgot' || mode === 'reset') && (
            <Text style={[s.footer, { color: theme.textSecondary }]}>
              <Text style={{ color: theme.link }} onPress={() => switchMode('login')} accessibilityRole="link">
                {t('auth.backToLogin')}
              </Text>
            </Text>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  header: { alignItems: 'center', marginBottom: space.xl },
  logo: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  tagline: { fontSize: 15, marginTop: 6 },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: 20,
    shadowColor: palette.light.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: radius.control,
    borderWidth: 1,
    padding: 3,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: space.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  fields: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 2, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: space.sm,
    fontSize: 15,
    marginBottom: space.xxs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    marginBottom: space.xxs,
  },
  inputInner: {
    flex: 1,
    paddingVertical: space.sm,
    fontSize: 15,
  },
  eyeBtn: {
    paddingLeft: space.xs,
    paddingVertical: space.xxs,
  },
  msg: { fontSize: 13, marginTop: space.xxs, marginBottom: 2 },
  btn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: radius.card,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { fontSize: 15, fontWeight: '700' },
  footer: { textAlign: 'center', marginTop: space.lg, fontSize: 14 },
  forgotBtn: { alignItems: 'center', marginTop: 10 },
  forgotText: { fontSize: 13 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, marginHorizontal: 10 },
  socialBtn: { height: 48, borderRadius: radius.card, marginTop: space.xs, alignItems: 'center', justifyContent: 'center' },
  guestBtn: { marginTop: 18, alignItems: 'center', paddingVertical: 10 },
  guestText: { fontSize: 15, fontWeight: '700' },
  guestHint: { fontSize: 12, textAlign: 'center', lineHeight: 17, paddingHorizontal: space.sm },
  googleBtn: { flexDirection: 'row', borderWidth: 1 },
  googleIcon: { marginRight: space.xs },
  googleText: { fontSize: 15, fontWeight: '600' },
});
