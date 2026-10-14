import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Animated, PanResponder,
  Dimensions, Platform, StyleSheet, Easing, useColorScheme, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Surfaces crashes as readable text instead of a silent white screen in production,
// where there is no Metro red-box and no console output to inspect.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('App crashed:', error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 20 }}>
          <Text style={{ color: '#C00', fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
            App crashed
          </Text>
          <ScrollView>
            <Text selectable style={{ color: '#000', fontSize: 13, marginBottom: 12 }}>
              {String(this.state.error?.message || this.state.error)}
            </Text>
            <Text selectable style={{ color: '#666', fontSize: 11 }}>
              {String(this.state.error?.stack || '')}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
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
  const { hasOnboarded, theme, themeName, requestedTab, setRequestedTab, modalOpen } = useApp();
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

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

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
