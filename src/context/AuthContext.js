import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import { supabase } from '../utils/supabase';
import { syncProfile, deleteAllUserData } from '../services/sync';
import { clearAll, saveData } from '../utils/storage';
import { clearDevMode } from '../utils/devMode';
import { setSentryUser } from '../utils/sentry';

// On web, lets the auth popup/redirect hand control back to the app.
WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext(null);

// Thrown (as an Error with this code) when the user dismisses a social sign-in sheet.
// Callers can check `err.code === AUTH_CANCELLED` to skip showing an error message.
export const AUTH_CANCELLED = 'AUTH_CANCELLED';

function cancelledError() {
  const e = new Error('Sign in cancelled');
  e.code = AUTH_CANCELLED;
  return e;
}

// Derive a human display name from whatever the identity provider gave us.
// Email sign-up sets `display_name`; Google sets `full_name`/`name`; Apple is
// handled explicitly in signInWithApple (it only sends the name once).
function nameFromUser(user) {
  const m = user?.user_metadata ?? {};
  return (m.display_name || m.full_name || m.name || '').trim();
}

// Parse the URL the OAuth provider redirected back to. Supports both the PKCE
// flow (`?code=...`) and the implicit flow (`#access_token=...&refresh_token=...`).
function parseAuthRedirect(url) {
  if (!url) return {};
  const out = {};
  const qIdx = url.indexOf('?');
  const hIdx = url.indexOf('#');
  const take = (str) => {
    if (!str) return;
    for (const pair of str.split('&')) {
      const [k, v = ''] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
  };
  if (qIdx !== -1) take(url.slice(qIdx + 1, hIdx !== -1 && hIdx > qIdx ? hIdx : undefined));
  if (hIdx !== -1) take(url.slice(hIdx + 1));
  return out;
}

async function createSessionFromUrl(url) {
  const params = parseAuthRedirect(url);
  if (params.error_description || params.error) {
    throw new Error(params.error_description || params.error);
  }
  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return data.session;
  }
  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    return data.session;
  }
  return null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Sign in with Apple is only offered on iOS / iPadOS (Apple guideline 4.8 only
    // requires it where it is natively supported, and the native sheet needs iOS 13+).
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync()
        .then((ok) => { if (isMounted) setAppleAvailable(!!ok); })
        .catch(() => {});
    }

    // Restore session from local storage immediately — no network needed.
    // This keeps the user logged in when offline and avoids a loading screen on every launch.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setSession(session);
        setLoading(false);
      }
    }).catch(() => {
      if (isMounted) setLoading(false);
    });

    // Background verification: round-trip to confirm the token is still valid.
    // Clear the session on definitive auth rejections (expired/revoked/deleted account),
    // but not on transient network errors so offline users stay logged in.
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!isMounted) return;
      if (!user && error) {
        const code = error?.status;
        const msg = error?.message ?? '';
        const isAuthFailure = code === 401 || code === 403
          || msg.includes('Refresh Token')
          || msg.includes('refresh_token')
          || msg.includes('Invalid JWT');
        if (isAuthFailure) setSession(null);
      }
    }).catch(() => {
      // Network unavailable — keep the locally restored session as-is.
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      setSession(session);
      setSentryUser(session?.user?.id ?? null);
      // Social sign-ins never go through signUp(), so make sure the profiles row
      // (used by the AI edge functions) exists with the provider-supplied name.
      if (event === 'SIGNED_IN' && session?.user) {
        const name = nameFromUser(session.user);
        if (name) syncProfile(session.user.id, name).catch(() => {});
      }
    });

    // Some Android browsers return the OAuth redirect as a deep link into the running
    // app instead of resolving openAuthSessionAsync. Handle that path too.
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url && (url.includes('code=') || url.includes('access_token='))) {
        createSessionFromUrl(url).catch(() => {});
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email, password, displayName = '') => {
    const trimmedName = displayName.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: trimmedName } },
    });
    if (error) throw error;
    // Also persist to profiles table so edge functions can access it
    if (data.user && trimmedName) {
      syncProfile(data.user.id, trimmedName).catch(() => {});
    }
    return data;
  };

  // ── Sign in with Apple (iOS / iPadOS only, native sheet) ──────────────────
  const signInWithApple = async () => {
    if (Platform.OS !== 'ios') throw new Error('Sign in with Apple is only available on iOS and iPadOS.');

    // Nonce binds the Apple identity token to this request. Apple receives the SHA-256
    // hash; Supabase receives the raw value and verifies it against the token's claim.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

    let credential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (e) {
      if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') throw cancelledError();
      throw e;
    }
    if (!credential?.identityToken) throw new Error('Apple did not return an identity token.');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;

    // Apple only provides the name on the very first authorization, so capture it now.
    const given = credential.fullName?.givenName?.trim() ?? '';
    const family = credential.fullName?.familyName?.trim() ?? '';
    const appleName = [given, family].filter(Boolean).join(' ');
    if (appleName && data?.user && !nameFromUser(data.user)) {
      await supabase.auth.updateUser({ data: { display_name: appleName } }).catch(() => {});
      syncProfile(data.user.id, appleName).catch(() => {});
    }
    return data;
  };

  // ── Sign in with Google (Supabase OAuth through the system browser) ──────
  // Uses one Google "Web application" OAuth client configured in Supabase; no native
  // Google SDK, so it works in Expo Go, dev builds, iOS, Android and web alike.
  const signInWithGoogle = async () => {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
      });
      if (error) throw error;
      return null; // full-page redirect; session is picked up on return via detectSessionInUrl
    }

    const redirectTo = Linking.createURL('auth/callback'); // groov://auth/callback (exp:// in Expo Go)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { showInRecents: true });
    if (result.type === 'cancel' || result.type === 'dismiss') throw cancelledError();
    if (result.type !== 'success' || !result.url) throw new Error('Google sign-in did not complete.');

    const newSession = await createSessionFromUrl(result.url);
    if (!newSession) throw new Error('Google sign-in did not return a session.');
    return newSession;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  // ── Guest (anonymous) accounts ─────────────────────────────────────────────
  // Lets people use Groov before creating an account. The anonymous user has a real
  // id, so RLS and sync work unchanged; linking an email / Google / Apple identity
  // later keeps the same id and therefore all the data.
  const signInAnonymously = async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  };

  const linkEmail = async (email, password, name = '') => {
    const trimmedName = name.trim();
    const { data, error } = await supabase.auth.updateUser({
      email: email.trim(),
      password,
      data: trimmedName ? { display_name: trimmedName } : undefined,
    });
    if (error) throw error;
    if (data?.user && trimmedName) syncProfile(data.user.id, trimmedName).catch(() => {});
    // With email confirmation off the session already carries the new email; the
    // refreshed user object arrives through onAuthStateChange (USER_UPDATED).
    return data;
  };

  const linkWithGoogle = async () => {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
      });
      if (error) throw error;
      return null;
    }
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { showInRecents: true });
    if (result.type === 'cancel' || result.type === 'dismiss') throw cancelledError();
    if (result.type !== 'success' || !result.url) throw new Error('Google linking did not complete.');
    const linked = await createSessionFromUrl(result.url);
    if (!linked) throw new Error('Google linking did not return a session.');
    return linked;
  };

  const linkWithApple = async () => {
    if (Platform.OS !== 'ios') throw new Error('Sign in with Apple is only available on iOS and iPadOS.');
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let credential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashedNonce,
      });
    } catch (e) {
      if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') throw cancelledError();
      throw e;
    }
    if (!credential?.identityToken) throw new Error('Apple did not return an identity token.');
    const { data, error } = await supabase.auth.linkIdentity({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
    if (error) throw error;
    const given = credential.fullName?.givenName?.trim() ?? '';
    const family = credential.fullName?.familyName?.trim() ?? '';
    const appleName = [given, family].filter(Boolean).join(' ');
    if (appleName && data?.user && !nameFromUser(data.user)) {
      await supabase.auth.updateUser({ data: { display_name: appleName } }).catch(() => {});
      syncProfile(data.user.id, appleName).catch(() => {});
    }
    return data;
  };

  const updateDisplayName = async (newName) => {
    const trimmed = newName.trim();
    const { error } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
    if (error) throw error;
    if (session?.user?.id) {
      syncProfile(session.user.id, trimmed).catch(() => {});
    }
  };

  const deleteAccount = async () => {
    const userId = session?.user?.id;
    if (!userId) throw new Error('Not signed in');
    // Use the access token already in React state — it's kept fresh by onAuthStateChange
    // (TOKEN_REFRESHED events). Calling getSession() here would risk returning a stale
    // token if autoRefreshToken recently failed (e.g. stale Expo Go session).
    const token = session?.access_token;
    // The edge function deletes every user-data row with the service role and then the
    // auth user. Local data is only wiped once it has confirmed success, so a failed
    // request (offline, server error) leaves the device fully usable and retryable.
    const res = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        },
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Failed to delete account');
    // Belt and braces: the client's own RLS-scoped delete, in case the server missed a table.
    await deleteAllUserData(userId).catch(() => {});
    // Wipe local storage so any re-registration starts completely clean.
    // Write the sentinel AFTER clearAll so it survives the wipe and AppContext
    // can detect it on the next login and reset in-memory state too.
    await clearAll();
    await saveData('accountWasDeleted', true);
    await clearDevMode();
    await supabase.auth.signOut();
  };

  const sendPasswordReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  };

  const verifyPasswordReset = async (email, token, newPassword) => {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'recovery',
    });
    if (verifyError) throw verifyError;
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) throw updateError;
  };

  const displayName = nameFromUser(session?.user);
  // 'email' | 'apple' | 'google' | 'anonymous' — handy for Settings (e.g. hide "Reset Password" for social accounts)
  const isAnonymous = !!session?.user?.is_anonymous;
  const authProvider = isAnonymous ? 'anonymous' : (session?.user?.app_metadata?.provider ?? 'email');

  return (
    <AuthContext.Provider value={{
      session,
      loading,
      user: session?.user ?? null,
      displayName,
      authProvider,
      isAnonymous,
      appleAvailable,
      signInAnonymously,
      linkEmail,
      linkWithGoogle,
      linkWithApple,
      signIn,
      signUp,
      signInWithApple,
      signInWithGoogle,
      signOut,
      updateDisplayName,
      deleteAccount,
      sendPasswordReset,
      verifyPasswordReset,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
