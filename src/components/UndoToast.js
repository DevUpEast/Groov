import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { t } from '../i18n';

// Bottom toast shown after a check-in: "<habit> logged · Undo". Auto-hides.
export default function UndoToast({ toast, onUndo, onHide, theme, bottom = 16, duration = 4000 }) {
  const y = useRef(new Animated.Value(80)).current;
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!toast) {
      Animated.timing(y, { toValue: 80, duration: 180, useNativeDriver: true }).start();
      return;
    }
    Animated.spring(y, { toValue: 0, useNativeDriver: true, tension: 90, friction: 12 }).start();
    timer.current = setTimeout(onHide, duration);
    return () => clearTimeout(timer.current);
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null;
  return (
    <Animated.View
      style={[styles.wrap, { bottom, transform: [{ translateY: y }] }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.toast, { backgroundColor: theme.text }]}>
        <Text style={[styles.msg, { color: theme.bg }]} numberOfLines={1}>{toast.message}</Text>
        <TouchableOpacity onPress={onUndo} style={styles.undoBtn} accessibilityRole="button" accessibilityLabel={t('common.undo')}>
          <Text style={[styles.undo, { color: '#A5B4FC' }]}>{t('common.undo')}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingLeft: 16, paddingRight: 6, paddingVertical: 8, borderRadius: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
    maxWidth: '100%',
  },
  msg: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  undoBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  undo: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});
