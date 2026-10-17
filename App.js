import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Animated, PanResponder, BackHandler,
  Dimensions, Platform, StyleSheet, Easing, useColorScheme, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { initSentry, captureException, wrapRoot } from './src/utils/sentry';
import { t, useLocale, initLocale } from './src/i18n';

// Crash reporting is a no-op until EXPO_PUBLIC_SENTRY_DSN is set (see src/utils/sentry.js).
initSentry();

// Catches render errors below the root. In production shows a friendly retry screen
// and reports to Sentry; in development also shows the message and stack so the
// cause is visible without a debugger.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: 0 };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack);
    captureException(error, { extra: { componentStack: info?.componentStack } });
  }
  retry = () => {
    // Remount the whole tree so transient state that caused the crash is discarded.
    this.setState(s => ({ error: null, resetKey: s.resetKey + 1 }));
  };
  render() {
    if (this.state.error) {
      const scheme = this.props.colorScheme === 'dark' ? themes.dark : themes.light;
      return (
        <View style={[crashStyles.root, { backgroundColor: scheme.bg }]}>
          <Text style={crashStyles.emoji}>😵</Text>
          <Text style={[crashStyles.title, { color: scheme.text }]}>{t('app.crash.title')}</Text>
          <Text style={[crashStyles.body, { color: scheme.textMuted }]}>
            {t('app.crash.body')}
          </Text>
          <TouchableOpacity style={[crashStyles.btn, { backgroundColor: scheme.primary }]} onPress={this.retry} activeOpacity={0.8} accessibilityRole="button">
            <Text style={crashStyles.btnText}>{t('app.crash.retry')}</Text>
          </TouchableOpacity>
          {__DEV__ && (
            <ScrollView style={crashStyles.devBox}>
              <Text selectable style={[crashStyles.devText, { color: scheme.danger }]}>
                {String(this.state.error?.message || this.state.error)}
              </Text>
              <Text selectable style={[crashStyles.devStack, { color: scheme.textMuted }]}>
                {String(this.state.error?.stack || '')}
              </Text>
            </ScrollView>
          )}
        </View>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

// Class components cannot call hooks; read the scheme here so the crash screen
// matches the device appearance even though the app's own theme is unavailable.
function ThemedErrorBoundary({ children }) {
  const colorScheme = useColorScheme();
  return <ErrorBoundary colorScheme={colorScheme}>{children}</ErrorBoundary>;
}

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { mockupParams, postToMockupHost } from './src/utils/mockup';
import { supabaseConfigError } from './src/utils/supabase';
import { AppProvider, useApp } from './src/context/AppContext';
import { themes } from './src/theme/colors';
import AuthScreen from './src/screens/AuthScreen';
import TodayScreen from './src/screens/TodayScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import ChallengeScreen from './src/screens/ChallengeScreen';
import HabitsScreen from './src/screens/HabitsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import NotificationPrimer from './src/components/NotificationPrimer';
import PaywallSheet from './src/components/PaywallSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_TABS = 5;
const SLIDE_DURATION = 180;

const TABS = [
  { key: 'today',     icon: 'home-outline' },
  { key: 'progress',  icon: 'bar-chart-outline' },
  { key: 'challenge', icon: 'trophy-outline' },
  { key: 'habits',    icon: 'clipboard-outline' },
  { key: 'settings',  icon: 'settings-outline' },
];

const SCREENS = [TodayScreen, ProgressScreen, ChallengeScreen, HabitsScreen, SettingsScreen];

function AppNavigator() {
  const { hasOnboarded, theme, themeName, requestedTab, setRequestedTab, modalOpen, notificationPrimer, paywall, closePaywall, refreshPro } = useApp();
  useLocale();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);
  // Each slide gets an id; only the latest one may clear isAnimating, so an interrupted slide's
  // late completion callback cannot unlock the pager while the next slide is still running.
  const animId = useRef(0);
  const onSlideEnd = () => {
    const id = ++animId.current;
    return () => { if (animId.current === id) isAnimating.current = false; };
  };
  const activeIndexRef = useRef(0);
  const modalOpenRef = useRef(false);

  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);

  // ALL hooks must be declared before any conditional return
  // `interrupt` stops a running slide first instead of ignoring the request (Android back).
  const goToTab = useCallback((newIndex, { interrupt = false } = {}) => {
    if (interrupt && isAnimating.current && newIndex !== activeIndexRef.current) {
      translateX.stopAnimation();
      isAnimating.current = false;
    }
    if (newIndex === activeIndexRef.current || isAnimating.current) return;
    if (newIndex < 0 || newIndex >= NUM_TABS) return;
    isAnimating.current = true;
    activeIndexRef.current = newIndex;
    setActiveIndex(newIndex);
    Animated.timing(translateX, {
      toValue: -newIndex * SCREEN_WIDTH,
      duration: SLIDE_DURATION,
      useNativeDriver: true,
      easing: Easing.out(Easing.quad),
    }).start(onSlideEnd());
  }, [translateX]);

  // Fresh onboarding always lands on Today, whatever tab was active before a reset.
  useEffect(() => {
    if (hasOnboarded && activeIndexRef.current !== 0) {
      activeIndexRef.current = 0;
      setActiveIndex(0);
      translateX.setValue(0);
    }
  }, [hasOnboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate when a screen requests a tab switch
  useEffect(() => {
    if (requestedTab !== null) {
      goToTab(requestedTab);
      setRequestedTab(null);
    }
  }, [requestedTab, goToTab, setRequestedTab]);

  // Android back (key or edge gesture): with no overlay open (every overlay is a Modal and handles
  // back itself), a non-Today tab returns to Today; on Today the event falls through and the
  // activity finishes, as Today is the start destination.
  useEffect(() => {
    if (!hasOnboarded) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeIndexRef.current === 0) return false;
      // Interrupt a running slide (e.g. back right after a tab tap) rather than swallow the press.
      goToTab(0, { interrupt: true });
      return true;
    });
    return () => sub.remove();
  }, [hasOnboarded, goToTab]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        !isAnimating.current &&
        !modalOpenRef.current &&
        Math.abs(gs.dx) > 12 &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.8,
      onPanResponderMove: (_, gs) => {
        const base = -activeIndexRef.current * SCREEN_WIDTH;
        const next = base + gs.dx;
        const min = -(NUM_TABS - 1) * SCREEN_WIDTH;
        translateX.setValue(Math.max(min, Math.min(0, next)));
      },
      onPanResponderRelease: (_, gs) => {
        const cur = activeIndexRef.current;
        const threshold = SCREEN_WIDTH * 0.25;
        if (gs.dx < -threshold && cur < NUM_TABS - 1) {
          isAnimating.current = true;
          activeIndexRef.current = cur + 1;
          setActiveIndex(cur + 1);
          Animated.timing(translateX, {
            toValue: -(cur + 1) * SCREEN_WIDTH,
            duration: SLIDE_DURATION,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }).start(onSlideEnd());
        } else if (gs.dx > threshold && cur > 0) {
          isAnimating.current = true;
          activeIndexRef.current = cur - 1;
          setActiveIndex(cur - 1);
          Animated.timing(translateX, {
            toValue: -(cur - 1) * SCREEN_WIDTH,
            duration: SLIDE_DURATION,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }).start(onSlideEnd());
        } else {
          Animated.spring(translateX, {
            toValue: -cur * SCREEN_WIDTH,
            useNativeDriver: true,
            tension: 100,
            friction: 12,
          }).start(onSlideEnd());
        }
      },
      onPanResponderTerminate: () => {
        const cur = activeIndexRef.current;
        Animated.spring(translateX, {
          toValue: -cur * SCREEN_WIDTH,
          useNativeDriver: true,
          tension: 100,
          friction: 12,
        }).start(onSlideEnd());
      },
    })
  ).current;

  // Conditional return AFTER all hooks
  // Mirror the status-bar style to the iOS mockup host (web only).
  const statusStyle = !hasOnboarded
    ? 'light' // OnboardingScreen renders a light StatusBar on its indigo background
    : (activeIndex === 0 ? 'light' : (themeName === 'dark' ? 'light' : 'dark'));
  useEffect(() => {
    if (mockupParams.active) postToMockupHost({ type: 'mockup:statusbar', style: statusStyle });
  }, [statusStyle]);

  // The primer sits above the onboarding gate: onboarding's reminders step awaits
  // ensureNotificationPermission(), which only the primer's buttons resolve (S-05).
  const primer = (
    <NotificationPrimer
      visible={notificationPrimer.visible}
      theme={theme}
      onAllow={() => notificationPrimer.answer(true)}
      onLater={() => notificationPrimer.answer(false)}
    />
  );

  if (!hasOnboarded) {
    return <><OnboardingScreen />{primer}</>;
  }

  // The iOS mockup (web) lays out like iOS so the preview matches a real iPhone.
  const TAB_BAR_HEIGHT = (Platform.OS === 'ios' || mockupParams.active) ? 49 + insets.bottom : 56;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={statusStyle} />
      {primer}
      <PaywallSheet
        visible={!!paywall}
        reason={paywall?.reason}
        theme={theme}
        onClose={closePaywall}
        onUnlocked={refreshPro}
      />

      <Animated.View
        style={[styles.screenRow, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {SCREENS.map((Screen, i) => (
          <View
            key={i}
            style={styles.screenSlot}
            pointerEvents={activeIndex === i ? 'auto' : 'none'}
            // Off-screen tabs stay mounted; hide them from TalkBack (importantForAccessibility),
            // VoiceOver (accessibilityElementsHidden) and web screen readers (aria-hidden;
            // react-native-web ignores the other two).
            importantForAccessibility={activeIndex === i ? 'auto' : 'no-hide-descendants'}
            accessibilityElementsHidden={activeIndex !== i}
            aria-hidden={activeIndex !== i}
          >
            <Screen />
          </View>
        ))}
      </Animated.View>

      <View style={[
        styles.tabBar,
        {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          height: TAB_BAR_HEIGHT,
          paddingBottom: insets.bottom,
        },
      ]}>
        {TABS.map((tab, i) => {
          const focused = activeIndex === i;
          const label = t(`app.tabs.${tab.key}`);
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabBtn}
              onPress={() => goToTab(i)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
            >
              <Ionicons
                name={tab.icon}
                size={focused ? 24 : 22}
                color={focused ? theme.tabIconActive : theme.tabIconInactive}
              />
              <Text style={[
                styles.tabLabel,
                { color: focused ? theme.tabIconActive : theme.tabIconInactive },
                focused && styles.tabLabelFocused,
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Gates the main app behind authentication.
// Using key={session.user.id} ensures AppProvider remounts fresh on each login.
function AuthGate() {
  const { session, loading } = useAuth();
  const scheme = useColorScheme();
  const theme = themes[scheme === 'dark' ? 'dark' : 'light'];
  useLocale();
  // The persisted language choice is applied before anything localized is painted.
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => { let on = true; initLocale().finally(() => { if (on) setLocaleReady(true); }); return () => { on = false; }; }, []);

  if (supabaseConfigError) {
    throw new Error(supabaseConfigError);
  }

  if (loading || !localeReady) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <AppProvider key={session.user.id}>
      <AppNavigator />
    </AppProvider>
  );
}

// On the web the iOS mockup host passes the device's safe-area insets (`?insets=top,right,bottom,left`)
// so the layout matches a real phone; everywhere else the native provider measures them.
// (The web provider measures CSS env() insets, which are zero in an iframe, so the
// mockup's insets are injected through the context rather than `initialMetrics`.)
const mockupInsets = mockupParams.insets;
function MockupInsets({ children }) {
  if (!mockupInsets) return children;
  return <SafeAreaInsetsContext.Provider value={mockupInsets}>{children}</SafeAreaInsetsContext.Provider>;
}

function App() {
  return (
    <ThemedErrorBoundary>
      <SafeAreaProvider>
        <MockupInsets>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </MockupInsets>
      </SafeAreaProvider>
    </ThemedErrorBoundary>
  );
}

export default wrapRoot(App);

const crashStyles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  btn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  devBox: { marginTop: 24, maxHeight: 260, alignSelf: 'stretch' },
  devText: { fontSize: 13, marginBottom: 8 },
  devStack: { fontSize: 11 },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  screenRow: {
    flex: 1,
    flexDirection: 'row',
    width: SCREEN_WIDTH * NUM_TABS,
  },
  screenSlot: {
    width: SCREEN_WIDTH,
    overflow: 'hidden',
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    gap: 3,
  },
  tabLabel: { fontSize: 11, fontWeight: '500' },
  tabLabelFocused: { fontWeight: '700' },
});
