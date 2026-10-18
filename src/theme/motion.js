// Motion tokens and reduced-motion primitives (plan §2.9, §4.3; F-05).
//
// Every animation duration, easing curve and spring in src/ comes from here; the source
// check in __tests__/motionTokens.test.js fails on a `tension:`/`friction:` or a literal
// `duration: <number>` anywhere else. Durations say how long a beat lasts; beats say when it
// starts (the 120 bpm grid of §4.1).
//
// Reduced motion (§2.9, §4.3): translate and scale become `duration.reduced` opacity fades,
// springs become `duration.reduced` timing, value tweens run in 150 ms with no overshoot, and
// celebrations use their static variants. Haptics and sound are unchanged. Use `useMotion()`
// in components; the plain helpers read the live OS setting when no flag is passed, so a
// PanResponder created once in a ref still follows it.
import { useMemo } from 'react';
import { Animated, Dimensions, Easing } from 'react-native';
import { isReducedMotion, useReducedMotion } from '../utils/a11y';

const REDUCED_MS = 150;

export const duration = {
  press: 100, // press-in scale and overlay
  state: 200, // check draw, chip fill, tint, cross-fades, the pager slide
  value: 300, // ring and bar tweens, scrim, snackbar in
  enter: 450, // large surface enter (sheet)
  reduced: REDUCED_MS, // every slide becomes this fade
  // Exits are about 30 % shorter: sheet exit 315, snackbar out 210.
  exit: (ms) => Math.round(ms * 0.7),
};

// Start offsets on the 120 bpm grid (a beat = 500 ms). Everything except b32 is a multiple
// of the sixteenth (125 ms).
export const beat = {
  b32: 62, // note spacing inside a two- or three-note motif
  b16: 125, // progress follows confirm
  b8: 250, // linked reward (challenge chip)
  bDot8: 375, // per-habit streak tick
  b4: 500, // downbeat: the credit departs the checked card
  b4b8: 750, // the credit arrives: resolution chord, haptic, gold ring
  b4b8b16: 875, // streak tick
};

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1), // state changes, value tweens
  emphasizedDecel: Easing.bezier(0.05, 0.7, 0.1, 1), // things entering
  emphasizedAccel: Easing.bezier(0.3, 0, 0.8, 0.15), // things leaving
};

export const spring = {
  snappy: { stiffness: 400, damping: 32, mass: 1 }, // ζ ≈ 0.8: press release, check pop, chip
  gentle: { stiffness: 220, damping: 27, mass: 1 }, // ζ ≈ 0.91: sheets
  celebrate: { stiffness: 180, damping: 16, mass: 1 }, // ζ ≈ 0.6: celebration layer only
};

// The celebration layer's own timings (CompletionCelebration, TrophyCelebration, the
// perfect-day confetti). Only full motion uses them; reduced motion shows the static variants.
export const celebration = {
  confettiFadeIn: duration.press,
  confettiFall: 2000, // plus up to confettiFallJitter
  confettiFallJitter: 1000,
  confettiFadeOutAt: 1500,
  confettiFadeOut: 500,
  confettiSpread: 600, // particle start delays fall in 0..600 ms
  overlayDone: 3000, // perfect-day confetti unmounts after this
  overlayDoneReduced: 300,
  fullConfettiFall: 2000, // plus up to fullConfettiFallJitter
  fullConfettiFallJitter: 1500,
  circleExpand: 650,
  textIn: 350,
  textInAt: 550,
  autoDismissAt: 3800,
  textOut: duration.value,
  circleCollapse: 500,
  tapTextOut: duration.state,
  tapCircleCollapse: 400,
  staticHold: 2500, // reduced-motion milestone card
  trophyOrbitAt: 600,
  trophyOrbit: 1400,
  trophyHoldAfterOrbit: 3500,
  trophyStaticHold: 2000, // reduced-motion trophy
};

// Hand-offs between surfaces that do not expose a completion callback. Sheet-to-sheet and
// sheet-to-tab hand-offs use the close callback instead (sheetOut(...).start(cb)).
export const handoff = {
  // A screen opening its own sheet after a tab change (deep link, Challenge -> Add habit):
  // the pager slide (duration.state) plus room for the screen to settle.
  afterTabChange: 350,
};

// Off-screen start/end for bottom sheets that slide on translateY.
export const SHEET_OFFSCREEN = Dimensions.get('window').height;
// Under reduced motion the sheet value maps to opacity over this distance instead: a drag to
// the 80 dp dismiss threshold reads as a clear fade (opacity 0.67), and open/close run over
// the same range so the 150 ms fade is spread evenly.
export const SHEET_FADE_RANGE = 240;

// The timing config every slide, scale and spring becomes under reduced motion (§2.9):
// `reduced(spring.gentle)` -> { duration: 150, easing: easing.standard }.
export function reduced(_token) {
  return { duration: REDUCED_MS, easing: easing.standard };
}

// Durations under reduced motion: nothing runs longer than duration.reduced.
export function reducedDuration(ms) {
  return Math.min(ms, REDUCED_MS);
}

const flag = (r) => (r === undefined ? isReducedMotion() : !!r);

// Animated.timing with tokens. `config.duration` defaults to duration.state and `easing` to
// easing.standard. Under reduced motion the duration is capped at 150 ms and the curve is the
// standard one (no overshoot). Delays are kept: beats stay on the grid (§4.3).
export function timing(value, config = {}, reducedMotion) {
  const r = flag(reducedMotion);
  const ms = config.duration ?? duration.state;
  return Animated.timing(value, {
    useNativeDriver: true,
    ...config,
    duration: r ? reducedDuration(ms) : ms,
    easing: r ? easing.standard : (config.easing ?? easing.standard),
  });
}

// Animated.spring with a spring token, or a 150 ms standard timing under reduced motion.
export function springTo(value, token, config = {}, reducedMotion) {
  const r = flag(reducedMotion);
  const { velocity, ...rest } = config;
  if (r) return Animated.timing(value, { useNativeDriver: true, ...rest, ...reduced(token) });
  return Animated.spring(value, { useNativeDriver: true, ...rest, ...token, ...(velocity !== undefined ? { velocity } : null) });
}

// Bottom sheets (interim until F-09a's Sheet primitive). One Animated value drives the sheet:
// translateY in full motion, opacity under reduced motion (see sheetMotionStyle).
// Opens from closed (callers set the value to SHEET_OFFSCREEN first).
export function sheetIn(value, reducedMotion) {
  const r = flag(reducedMotion);
  if (r) value.setValue(SHEET_FADE_RANGE);
  return springTo(value, spring.gentle, { toValue: 0 }, r);
}

export function sheetOut(value, offscreen = SHEET_OFFSCREEN, reducedMotion) {
  const r = flag(reducedMotion);
  return timing(value, { toValue: r ? SHEET_FADE_RANGE : offscreen, duration: duration.exit(duration.enter), easing: easing.emphasizedAccel }, r);
}

// A drag that did not pass the dismiss threshold settles back.
export function sheetSettle(value, reducedMotion) {
  return springTo(value, spring.gentle, { toValue: 0 }, reducedMotion);
}

// Style for the sheet body: slides in full motion; under reduced motion it stays put and the
// same value (0 = open, SHEET_FADE_RANGE or more = closed) becomes its opacity, so open,
// close and drag-to-dismiss are fades.
export function sheetMotionStyle(value, reducedMotion) {
  if (reducedMotion) {
    return { opacity: value.interpolate({ inputRange: [0, SHEET_FADE_RANGE], outputRange: [1, 0], extrapolate: 'clamp' }) };
  }
  return { transform: [{ translateY: value }] };
}

// Tokens and helpers bound to the live reduced-motion setting. Under reduced motion every
// duration token is capped at 150 ms; beats are unchanged (§4.3: the gold ring still lands at
// 750, by a fade). Re-renders the caller when the OS setting changes.
export function useMotion() {
  const r = useReducedMotion();
  return useMemo(() => {
    const d = r
      ? {
          press: reducedDuration(duration.press),
          state: reducedDuration(duration.state),
          value: reducedDuration(duration.value),
          enter: reducedDuration(duration.enter),
          reduced: REDUCED_MS,
          exit: (ms) => reducedDuration(duration.exit(ms)),
        }
      : duration;
    return {
      reduced: r,
      duration: d,
      beat,
      easing,
      spring,
      timing: (value, config) => timing(value, config, r),
      springTo: (value, token, config) => springTo(value, token, config, r),
      sheetIn: (value) => sheetIn(value, r),
      sheetOut: (value, offscreen) => sheetOut(value, offscreen, r),
      sheetSettle: (value) => sheetSettle(value, r),
      sheetStyle: (value) => sheetMotionStyle(value, r),
    };
  }, [r]);
}
