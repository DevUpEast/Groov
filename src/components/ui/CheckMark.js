import React, { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * The one done glyph (plan §3, C-02a): a stroked ✓ drawn as SVG, so it renders the same on
 * every platform and font (the text ✓ and the 🛡 emoji did not, CHK-1).
 * - `color`: the stroke (on an accent fill this is `accent.onFill`).
 * - `size`: the box in px (default 16); `strokeWidth` in the 16-unit viewBox (default 2.4).
 * - `progress` (C-06b): an Animated value 0..1 (native driver) that draws the ✓ in. The path
 *   runs left to right (down into the corner, then up to the tip), so the draw is a reveal
 *   whose edge sweeps from the stroke's start to its tip: two counter-moving clip layers on
 *   translateX. That keeps the draw on the UI thread: a strokeDashoffset tween must run on the
 *   JS driver (react-native-svg props are not native-animatable; the native driver crashed on
 *   an unmounted Path), and the tap's render blocks JS for ~100 ms on a release build, so a JS
 *   draw could not paint its first frames. Without `progress` the ✓ is static.
 */
export const CHECK_PATH = 'M3.5 8.5l3 3 6-7';
// Where the stroke starts, as a share of the box: the left end (3.5) less the round cap
// (strokeWidth / 2), so the sweep begins at the first painted pixel.
const DRAW_FROM = 2.3 / 16;

export default function CheckMark({ color, size = 16, strokeWidth = 2.4, testID, progress }) {
  const sweep = useMemo(() => {
    if (!progress) return null;
    const span = (1 - DRAW_FROM) * size;
    return {
      window: { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-span, 0], extrapolate: 'clamp' }) }] },
      content: { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [span, 0], extrapolate: 'clamp' }) }] },
    };
  }, [progress, size]);
  const glyph = (
    <Svg width={size} height={size} viewBox="0 0 16 16" testID={testID} accessible={false}>
      <Path d={CHECK_PATH} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
  if (!sweep) return glyph;
  const box = { width: size, height: size };
  return (
    <View style={[box, styles.clip]} pointerEvents="none">
      <Animated.View style={[box, styles.clip, sweep.window]}>
        <Animated.View style={[box, sweep.content]}>{glyph}</Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
