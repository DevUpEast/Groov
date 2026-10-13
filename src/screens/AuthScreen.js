import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth, AUTH_CANCELLED } from '../context/AuthContext';
import { themes } from '../theme/colors';

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
    signInWithApple, signInWithGoogle, appleAvailable,
  } = useAuth();
  const [socialLoading, setSocialLoading] = useState(null); // 'apple' | 'google' | null
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
      else await signInWithGoogle();
      // On success onAuthStateChange swaps AuthScreen out for the app.
    } catch (e) {
      if (e?.code !== AUTH_CANCELLED) {
        setError(e?.message || `Could not sign in with ${provider === 'apple' ? 'Apple' : 'Google'}. Please try again.`);
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setSuccessMsg('');

    if (mode === 'register' && !displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        const data = await signUp(email.trim(), password, displayName.trim());
        if (data?.user && !data.session) {
          setSuccessMsg('Check your email to confirm your account, then log in.');
          setMode('login');
        }
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
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
    if (!resetEmail.trim()) { setError('Enter your email address.'); return; }
    setLoading(true);
    try {
      await sendPasswordReset(resetEmail);
      setSuccessMsg(`A reset code has been sent to ${resetEmail.trim()}. Check your email and enter the code below.`);
      setMode('reset');
    } catch (e) {
      setError(e.message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetVerify = async () => {
    setError('');
    if (!resetCode.trim()) { setError('Enter the code from your email.'); return; }
    if (!newPassword) { setError('Enter a new password.'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmNewPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await verifyPasswordReset(resetEmail, resetCode, newPassword);
      setSuccessMsg('Password updated successfully! You can now log in.');
      switchMode('login');
    } catch (e) {
      setError(e.message || 'Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const tagline = mode === 'login' ? 'Welcome back'
    : mode === 'register' ? 'Create your account'
    : mode === 'forgot' ? 'Reset your password'
    : 'Enter your reset code';

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kav}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          <View style={s.header}>
            <Text style={[s.logo, { color: theme.primary }]}>Groov</Text>
            <Text style={[s.tagline, { color: theme.textMuted }]}>{tagline}</Text>
          </View>

          <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>

            {/* Login / Register tabs — hidden during password reset flow */}
            {(mode === 'login' || mode === 'register') && (
              <View style={[s.tabs, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                {['login', 'register'].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[s.tab, mode === m && { backgroundColor: theme.primary }]}
                    onPress={() => switchMode(m)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.tabText, { color: mode === m ? '#fff' : theme.textMuted }]}>
                      {m === 'login' ? 'Log In' : 'Register'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={s.fields}>
              {/* ── Forgot Password: enter email ── */}
              {mode === 'forgot' && (
                <>
                  <Text style={[s.label, { color: theme.textMuted }]}>Email</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {!!error && <Text style={[s.msg, { color: theme.danger }]}>{error}</Text>}
                  {!!successMsg && <Text style={[s.msg, { color: theme.success }]}>{successMsg}</Text>}
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: theme.primary }, loading && s.btnDisabled]}
                    onPress={handleForgotSend}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Send Reset Code</Text>}
                  </TouchableOpacity>
                </>
              )}

              {/* ── Reset: enter code + new password ── */}
              {mode === 'reset' && (
                <>
                  {!!successMsg && <Text style={[s.msg, { color: theme.success, marginBottom: 8 }]}>{successMsg}</Text>}
                  <Text style={[s.label, { color: theme.textMuted }]}>Reset Code</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={resetCode}
                    onChangeText={setResetCode}
                    placeholder="Code from your email"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={[s.label, { color: theme.textMuted }]}>New Password</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="••••••••"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry
                  />
                  <Text style={[s.label, { color: theme.textMuted }]}>Confirm New Password</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    placeholder="••••••••"
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry
                  />
                  {!!error && <Text style={[s.msg, { color: theme.danger }]}>{error}</Text>}
                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: theme.primary }, loading && s.btnDisabled]}
                    onPress={handleResetVerify}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Set New Password</Text>}
                  </TouchableOpacity>
                </>
              )}

              {/* ── Login / Register fields ── */}
              {(mode === 'login' || mode === 'register') && (
                <>
                  {mode === 'register' && (
                    <>
                      <Text style={[s.label, { color: theme.textMuted }]}>Display Name</Text>
                      <TextInput
                        style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholder="What should we call you?"
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="words"
                        autoCorrect={false}
                        maxLength={30}
                      />
                    </>
                  )}

                  <Text style={[s.label, { color: theme.textMuted }]}>Email</Text>
                  <TextInput
                    style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={[s.label, { color: theme.textMuted }]}>Password</Text>
                  <View style={[s.inputWrapper, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                    <TextInput
                      style={[s.inputInner, { color: theme.text }]}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="••••••••"
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn} activeOpacity={0.6}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {mode === 'register' && (
                    <>
                      <Text style={[s.label, { color: theme.textMuted }]}>Confirm Password</Text>
                      <View style={[s.inputWrapper, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                        <TextInput
                          style={[s.inputInner, { color: theme.text }]}
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          placeholder="••••••••"
                          placeholderTextColor={theme.textMuted}
                          secureTextEntry={!showConfirmPassword}
                        />
                        <TouchableOpacity onPress={() => setShowConfirmPassword(v => !v)} style={s.eyeBtn} activeOpacity={0.6}>
                          <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  {!!error && <Text style={[s.msg, { color: theme.danger }]}>{error}</Text>}
                  {!!successMsg && <Text style={[s.msg, { color: theme.success }]}>{successMsg}</Text>}

                  <TouchableOpacity
                    style={[s.btn, { backgroundColor: theme.primary }, loading && s.btnDisabled]}
                    onPress={handleSubmit}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={s.btnText}>{mode === 'login' ? 'Log In' : 'Create Account'}</Text>
                    }
                  </TouchableOpacity>

                  {mode === 'login' && (
                    <TouchableOpacity
                      style={s.forgotBtn}
                      onPress={() => { switchMode('forgot'); setResetEmail(email); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.forgotText, { color: theme.primary }]}>Forgot password?</Text>
                    </TouchableOpacity>
                  )}

                  {/* ── Social sign-in ── */}
                  <View style={s.dividerRow}>
                    <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
                    <Text style={[s.dividerText, { color: theme.textMuted }]}>or continue with</Text>
                    <View style={[s.dividerLine, { backgroundColor: theme.border }]} />
                  </View>

                  {Platform.OS === 'ios' && appleAvailable && (
                    socialLoading === 'apple' ? (
                      <View style={[s.socialBtn, { backgroundColor: isDark ? '#fff' : '#000' }]}>
                        <ActivityIndicator color={isDark ? '#000' : '#fff'} />
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
                    accessibilityLabel={mode === 'register' ? 'Sign up with Google' : 'Sign in with Google'}
                  >
                    {socialLoading === 'google'
                      ? <ActivityIndicator color={theme.text} />
                      : (
                        <>
                          <Ionicons name="logo-google" size={18} color={theme.text} style={s.googleIcon} />
                          <Text style={[s.googleText, { color: theme.text }]}>
                            {mode === 'register' ? 'Sign up with Google' : 'Sign in with Google'}
                          </Text>
                        </>
                      )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {(mode === 'login' || mode === 'register') && (
            <Text style={[s.footer, { color: theme.textMuted }]}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ color: theme.primary }} onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? 'Register' : 'Log in'}
              </Text>
            </Text>
          )}

          {(mode === 'forgot' || mode === 'reset') && (
            <Text style={[s.footer, { color: theme.textMuted }]}>
              <Text style={{ color: theme.primary }} onPress={() => switchMode('login')}>
                Back to Log In
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
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  tagline: { fontSize: 15, marginTop: 6 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  fields: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 2, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  inputInner: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
  },
  eyeBtn: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  msg: { fontSize: 13, marginTop: 4, marginBottom: 2 },
  btn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  footer: { textAlign: 'center', marginTop: 24, fontSize: 14 },
  forgotBtn: { alignItems: 'center', marginTop: 10 },
  forgotText: { fontSize: 13 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, marginHorizontal: 10 },
  socialBtn: { height: 48, borderRadius: 12, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  googleBtn: { flexDirection: 'row', borderWidth: 1 },
  googleIcon: { marginRight: 8 },
  googleText: { fontSize: 15, fontWeight: '600' },
});
