import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Animated, PanResponder, BackHandler,
  Dimensions, Platform, StyleSheet, useColorScheme, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { initSentry, captureException, wrapRoot } from './src/utils/sentry';
import { t, useLocale, initLocale } from './src/i18n';
import { duration, spring, timing, springTo } from './src/theme/motion';
import { isReducedMotion } from './src/utils/a11y';
import PressableScale from './src/components/ui/PressableScale';
import feedback, { EVENTS } from './src/services/feedback';

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
          <Text style={[crashStyles.body, { color: scheme.textSecondary }]}>
            {t('app.crash.body')}
          </Text>
          <TouchableOpacity style={[crashStyles.btn, { backgroundColor: scheme.action }]} onPress={this.retry} activeOpacity={0.8} accessibilityRole="button">
            <Text style={[crashStyles.btnText, { color: scheme.onAction }]}>{t('app.crash.retry')}</Text>
          </TouchableOpacity>
          {__DEV__ && (
            <ScrollView style={crashStyles.devBox}>
              <Text selectable style={[crashStyles.devText, { color: scheme.dangerText }]}>
                {String(this.state.error?.message || this.state.error)}
              </Text>
              <Text selectable style={[crashStyles.devStack, { color: scheme.textSecondary }]}>
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
import { setOverlayChangesStatusBar } from './src/utils/overlayStatus';
import { supabaseConfigError } from './src/utils/supabase';
import { AppProvider, useApp } from './src/context/AppContext';
import { themes } from './src/theme/colors';
import { loadAppFonts } from './src/theme/fonts';
import { type } from './src/theme/typography';
import AuthScreen from './src/screens/AuthScreen';
import TodayScreen from './src/screens/TodayScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import ChallengeScreen from './src/screens/ChallengeScreen';
import HabitsScreen from './src/screens/HabitsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import NotificationPrimer from './src/components/NotificationPrimer';
import PaywallSheet from './src/components/PaywallSheet';
import DesignPreview from './src/screens/DesignPreview';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_TABS = 5;

// The longest tab label (characters) that keeps equal tabs: 10 characters fit a fifth of a
// 375 pt phone at 12 pt, bold when focused; fr "Aujourd'hui" (11) already does not.
const TAB_LABEL_EQUAL_MAX = 10;

const TABS = [
  { key: 'today',     icon: 'home-outline' },
  { key: 'progress',  icon: 'bar-chart-outline' },
  { key: 'challenge', icon: 'trophy-outline' },
  { key: 'habits',    icon: 'clipboard-outline' },
  { key: 'settings',  icon: 'settings-outline' },
];

const SCREENS = [TodayScreen, ProgressScreen, ChallengeScreen, HabitsScreen, SettingsScreen];

function AppNavigator() {
  const { hasOnboarded, theme, themeName, requestedTab, setRequestedTab, modalOpen, notificationPrimer, paywall, closePaywall, refreshPro, pendingRoute, clearPendingRoute } = useApp();
  // groov://dev/design opens the token preview, in dev builds and the web mockup only (F-01).
  const [designOpen, setDesignOpen] = useState(false);
  useEffect(() => {
    // AppContext already drops this route outside dev builds and the mockup (isRouteAllowed).
    if (pendingRoute?.action === 'designPreview') { setDesignOpen(true); clearPendingRoute(); }
  }, [pendingRoute]);
  useLocale();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  // Reduced motion (F-05): a tab change jumps the row and fades the new screen in over
  // duration.reduced instead of sliding. Swipe paging still follows the finger.
  const pagerOpacity = useRef(new Animated.Value(1)).current;
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
      pagerOpacity.stopAnimation();
      pagerOpacity.setValue(1);
      isAnimating.current = false;
    }
    if (newIndex === activeIndexRef.current || isAnimating.current) return;
    if (newIndex < 0 || newIndex >= NUM_TABS) return;
    isAnimating.current = true;
    activeIndexRef.current = newIndex;
    setActiveIndex(newIndex);
    if (isReducedMotion()) {
      translateX.setValue(-newIndex * SCREEN_WIDTH);
      pagerOpacity.setValue(0);
      timing(pagerOpacity, { toValue: 1, duration: duration.reduced }, true).start(onSlideEnd());
      return;
    }
    timing(translateX, { toValue: -newIndex * SCREEN_WIDTH, duration: duration.state }, false).start(onSlideEnd());
  }, [translateX, pagerOpacity]);

  // Fresh onboarding always lands on Today, whatever tab was active before a reset.
  // The row is always fully opaque after onboarding, even if a reduced-motion fade was cut off.
  useEffect(() => {
    if (!hasOnboarded) return;
    pagerOpacity.stopAnimation();
    pagerOpacity.setValue(1);
    if (activeIndexRef.current !== 0) {
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
          timing(translateX, { toValue: -(cur + 1) * SCREEN_WIDTH, duration: duration.state }).start(onSlideEnd());
        } else if (gs.dx > threshold && cur > 0) {
          isAnimating.current = true;
          activeIndexRef.current = cur - 1;
          setActiveIndex(cur - 1);
          timing(translateX, { toValue: -(cur - 1) * SCREEN_WIDTH, duration: duration.state }).start(onSlideEnd());
        } else {
          springTo(translateX, spring.snappy, { toValue: -cur * SCREEN_WIDTH }).start(onSlideEnd());
        }
      },
      onPanResponderTerminate: () => {
        const cur = activeIndexRef.current;
        springTo(translateX, spring.snappy, { toValue: -cur * SCREEN_WIDTH }).start(onSlideEnd());
      },
    })
  ).current;

  // Conditional return AFTER all hooks
  // Mirror the status-bar style to the iOS mockup host (web only).
  // Every tab, Today included, starts on the theme background (C-04 replaced the indigo Today
  // hero with the inset brand strip), so the icons follow the theme: ink in light, light in
  // dark. Scrims only darken the screen, so the style never needs to change under an overlay.
  const baseStatus = !hasOnboarded
    ? 'light' // OnboardingScreen renders the same style on its brand ground (indigo / deep indigo)
    : (themeName === 'dark' ? 'light' : 'dark');
  const statusStyle = baseStatus;
  // Tells OverlayModal whether an overlay opened now would flip the style (and so must wait for
  // it on Android). With the theme-following style above it never does.
  setOverlayChangesStatusBar(false);
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
  const tabLabels = TABS.map(tab => t(`app.tabs.${tab.key}`));
  const tabsByLabel = tabLabels.some(l => l.length > TAB_LABEL_EQUAL_MAX);
  const TAB_BAR_HEIGHT = (Platform.OS === 'ios' || mockupParams.active) ? 49 + insets.bottom : 56;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={statusStyle} />
      {primer}
      {designOpen && <DesignPreview visible onClose={() => setDesignOpen(false)} />}
      <PaywallSheet
        visible={!!paywall}
        reason={paywall?.reason}
        theme={theme}
        onClose={closePaywall}
        onUnlocked={refreshPro}
      />

      <Animated.View
        style={[styles.screenRow, { opacity: pagerOpacity, transform: [{ translateX }] }]}
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

      {/* Equal tabs keep the icons on an even rhythm; a locale with a label too long for a
          fifth of a phone at the 12 pt floor (de "Einstellungen", fr "Aujourd'hui") shares the
          bar by label width instead, so nothing wraps or clips (until G-01's short labels). */}
      <View style={[
        styles.tabBar,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: TAB_BAR_HEIGHT,
          paddingBottom: insets.bottom,
        },
      ]}>
        {TABS.map((tab, i) => {
          const focused = activeIndex === i;
          const label = tabLabels[i];
          return (
            // Press scale + ripple (F-06); switching tabs is a `selection` tick (§2.10), a re-tap
            // of the current tab is silent.
            <PressableScale
              key={tab.key}
              style={[styles.tabBtn, tabsByLabel && styles.tabBtnByLabel]}
              onPress={() => { if (!focused) feedback.play(EVENTS.selection); goToTab(i); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
            >
              <Ionicons
                name={tab.icon}
                size={focused ? 24 : 22}
                color={focused ? theme.tabActive : theme.tabInactive}
              />
              <Text numberOfLines={1} style={[
                styles.tabLabel,
                { color: focused ? theme.tabActive : theme.tabInactive },
                focused && styles.tabLabelFocused,
              ]}>
                {label}
              </Text>
            </PressableScale>
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
  // The persisted language choice and the display face (Space Grotesk, bounded by a timeout,
  // src/theme/fonts.js) are both ready before anything is painted, so numerals never flash
  // in a fallback face.
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    let on = true;
    Promise.all([initLocale(), loadAppFonts()]).finally(() => { if (on) setLocaleReady(true); });
    return () => { on = false; };
  }, []);

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
  btnText: { fontSize: 16, fontWeight: '700' },
  devBox: { marginTop: 24, maxHeight: 260, alignSelf: 'stretch' },
  devText: { fontSize: 13, marginBottom: 8 },
  devStack: { fontSize: 12 },
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
  // 4 + 24 icon + 1 + 16 line = 45 fits the 49 pt iOS bar.
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingHorizontal: 2,
    gap: 1,
  },
  // Label-width sharing: basis = the label, then equal growth.
  tabBtnByLabel: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
  tabLabel: { ...type.caption },
  tabLabelFocused: { fontWeight: '700' },
});
