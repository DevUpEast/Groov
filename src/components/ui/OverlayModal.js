import React, { useEffect, useState } from 'react';
import { Modal, Platform } from 'react-native';
import { overlayOpened, overlayChangesStatusBar } from '../../utils/overlayStatus';
import { useMotion } from '../../theme/motion';

/**
 * React Native's `Modal`, plus the status-bar rule for scrimmed overlays (F-02).
 *
 * While it is open the overlay is registered with utils/overlayStatus. `heavyScrim` marks a
 * celebration overlay (70 % black `celebrationScrim`): while one is open App.js switches the
 * status bar to light icons in light mode, where ink icons over that scrim are ~2.5:1.
 *
 * Android: the Modal's dialog window copies the activity's status-bar appearance once, when it
 * is created (ReactModalHostView.updateSystemAppearance), so the activity must already have the
 * new style by then. When opening would change the style (`overlayChangesStatusBar(heavy)`: a
 * heavy scrim in light mode), the overlay is registered at once and the Modal is shown two
 * frames (~32 ms) later, after the StatusBar update has reached the activity. Every other open
 * (all normal scrims, and dark mode, whose icons are already light) is immediate, as on iOS and
 * web. Closing is always immediate.
 *
 * The deferred gap: for those ~32 ms no dialog window exists yet, so an Android back press
 * reaches App's BackHandler instead of the Modal's onRequestClose (on a non-Today tab it goes to
 * Today; on Today it leaves the app). The window opens right after a tap, so this is accepted.
 *
 * Reduced motion (F-05): `animationType="slide"` becomes a fade, so no sheet slides.
 */
const ANDROID = Platform.OS === 'android';
export default function OverlayModal({ visible, animationType, heavyScrim = false, ...props }) {
  const want = !!visible;
  const mustDefer = () => ANDROID && overlayChangesStatusBar(heavyScrim);
  const { reduced } = useMotion();
  const [shown, setShown] = useState(() => want && !mustDefer());

  useEffect(() => (want ? overlayOpened({ heavy: heavyScrim }) : undefined), [want, heavyScrim]);

  useEffect(() => {
    if (!want) { setShown(false); return undefined; }
    if (!mustDefer()) { setShown(true); return undefined; }
    let raf2;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
  }, [want]);

  const animation = reduced && animationType === 'slide' ? 'fade' : animationType;
  return <Modal visible={want && shown} animationType={animation} {...props} />;
}
