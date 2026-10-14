import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

// supabase-js uses the PKCE flow for OAuth. It needs `crypto.subtle.digest` to build an
// S256 code challenge; without it (React Native has no WebCrypto) it silently falls back
// to the weaker "plain" method. Bridge the one call it makes to expo-crypto.
if (Platform.OS !== 'web') {
  const g = globalThis;
  if (!g.crypto) g.crypto = {};
  if (typeof g.crypto.getRandomValues !== 'function') g.crypto.getRandomValues = (arr) => Crypto.getRandomValues(arr);
  if (!g.crypto.subtle) {
    g.crypto.subtle = {
      digest: (algorithm, data) => {
        const name = (typeof algorithm === 'string' ? algorithm : algorithm?.name || '').toUpperCase();
        const map = { 'SHA-256': Crypto.CryptoDigestAlgorithm.SHA256, 'SHA-1': Crypto.CryptoDigestAlgorithm.SHA1, 'SHA-384': Crypto.CryptoDigestAlgorithm.SHA384, 'SHA-512': Crypto.CryptoDigestAlgorithm.SHA512 };
        if (!map[name]) return Promise.reject(new Error(`Unsupported digest: ${name}`));
        return Crypto.digest(map[name], data);
      },
    };
  }
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Throwing here happens at module-import time, before React ever mounts, which would
// bypass the App.js ErrorBoundary and produce a silent white screen with no visible
// error. Surface a placeholder URL/key instead so the failure happens inside a render
// (e.g. a fetch error in AuthContext) where the ErrorBoundary can display it.
export const supabaseConfigError = (!supabaseUrl || !supabaseAnonKey)
  ? 'Missing Supabase environment variables. Ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.'
  : null;

if (supabaseConfigError) console.error('[Supabase]', supabaseConfigError);

export const supabase = createClient(supabaseUrl || 'https://placeholder.invalid', supabaseAnonKey || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});
