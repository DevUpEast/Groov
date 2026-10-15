import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Animated, PanResponder,
  Dimensions, Platform, StyleSheet, Easing, useColorScheme, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { initSentry, captureException, wrapRoot } from './src/utils/sentry';

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
          <Text style={[crashStyles.title, { color: scheme.text }]}>Something went wrong</Text>
          <Text style={[crashStyles.body, { color: scheme.textMuted }]}>
            Groov hit an unexpected error. Your habits are saved. Tap below to try again, and if it
            keeps happening, restart the app.
          </Text>
          <TouchableOpacity style={[crashStyles.btn, { backgroundColor: scheme.primary }]} onPress={this.retry} activeOpacity={0.8} accessibilityRole="button">
            <Text style={crashStyles.btnText}>Try again</Text>
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_TABS = 5;
const SLIDE_DURATION = 180;

const TABS = [
  { name: 'Today',     icon: 'home-outline' },
  { name: 'Progress',  icon: 'bar-chart-outline' },
  { name: 'Challenge', icon: 'trophy-outline' },
  { name: 'Habits',    icon: 'clipboard-outline' },
  { name: 'Settings',  icon: 'settings-outline' },
];

const SCREENS = [TodayScreen, ProgressScreen, ChallengeScreen, HabitsScreen, SettingsScreen];

function AppNavigator() {
  const { hasOnboarded, theme, themeName, requestedTab, setRequestedTab, modalOpen, notificationPrimer } = useApp();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);
  const activeIndexRef = useRef(0);
  const modalOpenRef = useRef(false);

  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);

  // ALL hooks must be declared before any conditional return
  const goToTab = useCallback((newIndex) => {
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
    }).start(() => { isAnimating.current = false; });
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
          }).start(() => { isAnimating.current = false; });
        } else if (gs.dx > threshold && cur > 0) {
          isAnimating.current = true;
          activeIndexRef.current = cur - 1;
          setActiveIndex(cur - 1);
          Animated.timing(translateX, {
            toValue: -(cur - 1) * SCREEN_WIDTH,
            duration: SLIDE_DURATION,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }).start(() => { isAnimating.current = false; });
        } else {
          Animated.spring(translateX, {
            toValue: -cur * SCREEN_WIDTH,
            useNativeDriver: true,
            tension: 100,
            friction: 12,
          }).start(() => { isAnimating.current = false; });
        }
      },
      onPanResponderTerminate: () => {
        const cur = activeIndexRef.current;
        Animated.spring(translateX, {
          toValue: -cur * SCREEN_WIDTH,
          useNativeDriver: true,
          tension: 100,
          friction: 12,
        }).start(() => { isAnimating.current = false; });
      },
    })
  ).current;

  // Conditional return AFTER all hooks
  if (!hasOnboarded) {
    return <OnboardingScreen />;
  }

  const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 + insets.bottom : 56;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={activeIndex === 0 ? 'light' : (themeName === 'dark' ? 'light' : 'dark')} />
      <NotificationPrimer
        visible={notificationPrimer.visible}
        theme={theme}
        onAllow={() => notificationPrimer.answer(true)}
        onLater={() => notificationPrimer.answer(false)}
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
          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tabBtn}
              onPress={() => goToTab(i)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.name}
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
                {tab.name}
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

  if (supabaseConfigError) {
    throw new Error(supabaseConfigError);
  }

  if (loading) {
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

function App() {
  return (
    <ThemedErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
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
