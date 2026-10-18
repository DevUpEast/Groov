import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { t } from '../i18n';
import { duration, easing, useMotion } from '../theme/motion';

const OFFSET = 80; // starts this far below its resting place

// Bottom toast shown after a check-in: "<habit> logged · Undo". Auto-hides after
// `toast.duration` (falls back to `duration`; Mark the rest done uses 8 s).
// Enters over duration.value (emphasized decel) and leaves in duration.exit(value) (emphasized
// accel); the last toast stays rendered until its exit has finished. Under reduced motion it
// never slides: it fades in and out in 150 ms (F-05).
export default function UndoToast({ toast, onUndo, onHide, theme, bottom = 16, duration: hideAfter = 4000 }) {
  const motion = useMotion();
  const y = useRef(new Animated.Value(OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  // What is on screen: the current toast, or the previous one while it animates out.
  const [shown, setShown] = useState(toast);
  const exiting = !toast && !!shown;

  useEffect(() => {
    clearTimeout(timer.current);
    if (!toast) {
      if (!shown) return undefined;
      const out = duration.exit(duration.value);
      const parts = [motion.timing(opacity, { toValue: 0, duration: out, easing: easing.emphasizedAccel })];
      if (!motion.reduced) parts.push(motion.timing(y, { toValue: OFFSET, duration: out, easing: easing.emphasizedAccel }));
      const anim = Animated.parallel(parts);
      anim.start(({ finished }) => { if (finished) setShown(null); });
      return () => anim.stop();
    }
    setShown(toast);
    y.stopAnimation();
    opacity.stopAnimation();
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

  if (!shown) return null;
  return (
    <Animated.View
      style={[styles.wrap, { bottom, opacity, transform: [{ translateY: y }] }]}
      pointerEvents={exiting ? 'none' : 'box-none'}
      accessibilityLiveRegion="polite"
      accessibilityElementsHidden={exiting}
      importantForAccessibility={exiting ? 'no-hide-descendants' : 'auto'}
    >
      <View style={[styles.toast, { backgroundColor: theme.toast, borderColor: theme.toastEdge, shadowColor: theme.shadow }]}>
        <Text style={[styles.msg, { color: theme.onToast }]} numberOfLines={1}>{shown.message}</Text>
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
