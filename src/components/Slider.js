import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import { t } from '../i18n';
import { space, radius } from '../theme/tokens';

export default function Slider({ value, min = 1, max, onValueChange, theme, label }) {
  const layoutRef = useRef({ x: 0, width: 1 });
  const maxRef = useRef(max);
  const minRef = useRef(min);
  const onChangeRef = useRef(onValueChange);
  const ref = useRef(null);

  useEffect(() => { maxRef.current = max; }, [max]);
  useEffect(() => { minRef.current = min; }, [min]);
  useEffect(() => { onChangeRef.current = onValueChange; }, [onValueChange]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (_, gs) => {
      const { x, width } = layoutRef.current;
      const mn = minRef.current;
      const mx = maxRef.current;
      const ratio = Math.max(0, Math.min(1, (gs.x0 - x) / width));
      onChangeRef.current(Math.max(mn, Math.round(ratio * (mx - mn) + mn)));
    },
    onPanResponderMove: (_, gs) => {
      const { x, width } = layoutRef.current;
      const mn = minRef.current;
      const mx = maxRef.current;
      const ratio = Math.max(0, Math.min(1, (gs.moveX - x) / width));
      onChangeRef.current(Math.max(mn, Math.round(ratio * (mx - mn) + mn)));
    },
  })).current;

  const fillRatio = max <= min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));

  const onAccessibilityAction = (e) => {
    const name = e?.nativeEvent?.actionName;
    if (name === 'increment') onValueChange(Math.min(max, value + 1));
    else if (name === 'decrement') onValueChange(Math.max(min, value - 1));
  };

  return (
    <View
      ref={ref}
      onLayout={() => ref.current?.measure((fx, fy, w, h, px) => {
        layoutRef.current = { x: px, width: Math.max(w, 1) };
      })}
      {...panResponder.panHandlers}
      style={styles.trackArea}
      accessible={true}
      accessibilityRole="adjustable"
      accessibilityLabel={label || t('common.slider')}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
    >
      <View style={[styles.track, { backgroundColor: theme.track }]}>
        <View style={[styles.fill, { width: `${fillRatio * 100}%`, backgroundColor: theme.meter }]} />
      </View>
      <View style={[styles.thumb, { left: `${Math.max(0, Math.min(100, fillRatio * 100))}%`, backgroundColor: theme.meter, shadowColor: theme.shadow }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  trackArea: { height: 44, justifyContent: 'center', marginBottom: space.xxs, marginHorizontal: 11 },
  track: { height: 6, borderRadius: radius.pill },
  fill: { height: 6, borderRadius: radius.pill },
  thumb: {
    position: 'absolute', width: 22, height: 22, borderRadius: radius.pill, marginLeft: -11, top: 11,
    elevation: 3, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2,
  },
});
