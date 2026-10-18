import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { duration, easing, useMotion } from '../theme/motion';

const OFFSET = 80; // starts this far below its resting place

// Bottom toast shown after a check-in: "<habit> logged · Undo". Auto-hides after
// `toast.duration` (falls back to `duration`; Mark the rest done uses 8 s).
// Enters over duration.value (emphasized decel) and leaves in duration.exit(value); under
// reduced motion it does not slide and fades in 150 ms instead (F-05).
export default function UndoToast({ toast, onUndo, onHide, theme, bottom = 16, duration: hideAfter = 4000 }) {
  const motion = useMotion();
  const y = useRef(new Animated.Value(OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!toast) {
      Animated.parallel([
        motion.timing(y, { toValue: OFFSET, duration: duration.exit(duration.value), easing: easing.emphasizedAccel }),
        motion.timing(opacity, { toValue: 0, duration: duration.exit(duration.value), easing: easing.emphasizedAccel }),
      ]).start();
      return;
    }
    if (motion.reduced) {
      y.setValue(0);
      opacity.setValue(0);
      motion.timing(opacity, { toValue: 1, duration: duration.reduced }).start();
    } else {
      opacity.setValue(1);
      motion.timing(y, { toValue: 0, duration: duration.value, easing: easing.emphasizedDecel }).start();
    }
    timer.current = setTimeout(onHide, toast.duration ?? hideAfter);
    return () => clearTimeout(timer.current);
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null;
  return (
    <Animated.View
      style={[styles.wrap, { bottom, opacity, transform: [{ translateY: y }] }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.toast, { backgroundColor: theme.toast, borderColor: theme.toastEdge, shadowColor: theme.shadow }]}>
        <Text style={[styles.msg, { color: theme.onToast }]} numberOfLines={1}>{toast.message}</Text>
        <TouchableOpacity onPress={onUndo} style={styles.undoBtn} accessibilityRole="button" accessibilityLabel={t('common.undo')}>
          <Text style={[styles.undo, { color: theme.toastAction }]}>{t('common.undo')}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingLeft: 16, paddingRight: 6, paddingVertical: 8, borderRadius: 12, borderWidth: 1,
    shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
    maxWidth: '100%',
  },
  msg: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  undoBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  undo: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
});
