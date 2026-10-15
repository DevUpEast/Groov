import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// True when the OS "reduce motion" setting is on. Celebrations and other large
// animations fall back to a static presentation. Web reads the media query.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    if (Platform.OS === 'web') {
      try {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (mq) {
          setReduced(mq.matches);
          const onChange = (e) => setReduced(e.matches);
          mq.addEventListener?.('change', onChange);
          return () => mq.removeEventListener?.('change', onChange);
        }
      } catch {}
      return undefined;
    }
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(!!v));
    return () => { mounted = false; sub?.remove?.(); };
  }, []);
  return reduced;
}

// Post a short message to the screen reader (e.g. "Drink water done").
export function announce(message) {
  try { AccessibilityInfo.announceForAccessibility(message); } catch {}
}
