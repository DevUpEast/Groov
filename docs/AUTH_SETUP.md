# Apple and Google sign-in: setup checklist

The app code is done (see `src/context/AuthContext.js`, `src/screens/AuthScreen.js`). The
remaining steps need accounts only Isaac controls. Everything below is one-time.

## How the two flows work

| Provider | Platforms | Mechanism | Needs native build? |
|---|---|---|---|
| Apple | iOS and iPadOS only (button is hidden elsewhere) | `expo-apple-authentication` native sheet, then `supabase.auth.signInWithIdToken({ provider: 'apple' })` with a SHA-256 nonce | Yes: EAS dev build or TestFlight (not Expo Go, whose bundle ID lacks the entitlement) |
| Google | iOS, Android, web | `supabase.auth.signInWithOAuth({ provider: 'google' })` opened in the system browser via `expo-web-browser`, PKCE code exchanged on return to `groov://auth/callback` | No: works in Expo Go, dev builds and web |

Apple's guideline 4.8 requires Sign in with Apple wherever a third-party login is offered on iOS. Showing Apple on iOS only and Google everywhere satisfies it.

## 1. Google Cloud (about 5 minutes, no CLI exists for this)

1. Open https://console.cloud.google.com, create a project called "Groov".
2. APIs & Services > OAuth consent screen: External, app name "Groov", support email, add yourself as a test user. Publishing can wait.
3. APIs & Services > Credentials > Create credentials > OAuth client ID > **Web application**.
   - Name: "Supabase".
   - Authorized redirect URI: `https://fdplqvebauivtlywornw.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**.

No iOS or Android OAuth clients are needed for this flow.

## 2. Supabase (scripted)

1. Dashboard > Account > Access Tokens > generate a token.
2. In PowerShell, from the repo root:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
$env:GOOGLE_CLIENT_ID      = "....apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET  = "GOCSPX-..."
node scripts/supabase-auth-providers.mjs
```

This enables the Apple provider with the bundle ID `com.beastlyiceking.groov` as an authorized client, enables Google with the web client, and adds `groov://auth/callback`, `groov://*`, `exp://*/**` and localhost to the redirect allow-list.

To let Claude Code manage the backend afterwards, keep `SUPABASE_ACCESS_TOKEN` set as a **user environment variable** (System Properties > Environment Variables) and run once:

```powershell
supabase link --project-ref fdplqvebauivtlywornw
```

It will ask for the database password. After that `supabase db push`, `supabase functions deploy` and `supabase secrets set` work without the dashboard.

## 3. Apple Developer (for Sign in with Apple and TestFlight)

1. Confirm the Apple Developer Program membership on `beastlyiceking@gmail.com` is active.
2. App Store Connect > Users and Access > Integrations > App Store Connect API > generate a key with **App Manager** access. Download the `.p8` once and note the **Key ID** and **Issuer ID**.
3. Store the three values as user environment variables so EAS runs non-interactively:
   - `EXPO_ASC_API_KEY_PATH` = full path to the `.p8`
   - `EXPO_ASC_KEY_ID`
   - `EXPO_ASC_ISSUER_ID`
   - `EXPO_APPLE_TEAM_ID` (from https://developer.apple.com/account, Membership details)
4. Expo: https://expo.dev > Account settings > Access tokens > create one, store as `EXPO_TOKEN`.

With those set, `eas build --platform ios --profile development` provisions the App ID, enables the Sign in with Apple capability (from `ios.usesAppleSignIn` in app.json) and signs the build without prompts.

## 4. Testing

- **Android emulator** (this PC): `npx expo run:android` or an EAS dev build. Google sign-in opens Chrome inside the emulator; Apple button is hidden.
- **Web**: `npm run web`, Google works via full-page redirect; Apple hidden.
- **iPhone/iPad**: install the EAS development build or TestFlight build. Both buttons appear. First Apple sign-in returns the name; subsequent ones do not (handled in code).

## Notes

- `src/utils/supabase.js` now uses `flowType: 'pkce'` and `detectSessionInUrl` on web only. Email/password, OTP password reset and account deletion are unchanged.
- Social accounts have no Groov password, so Settings hides "Reset Password" when `authProvider !== 'email'`.
- `profiles` is upserted on every `SIGNED_IN` with the provider-supplied name so the AI edge functions still see a display name.
