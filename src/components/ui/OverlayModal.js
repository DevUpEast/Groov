import React, { useEffect, useState } from 'react';
import { Modal, Platform } from 'react-native';
import { overlayOpened } from '../../utils/overlayStatus';

/**
 * React Native's `Modal`, plus the status-bar rule for scrimmed overlays (F-02).
 *
 * While it is open the overlay is registered with utils/overlayStatus, so App.js switches the
 * status bar to light icons in dark mode (ink icons on the scrimmed #818CF8 hero are ~1.6:1).
 *
 * Android: the Modal's dialog window copies the activity's status-bar appearance once, when it
 * is created (ReactModalHostView.updateSystemAppearance), so the activity must already be light
 * by then. The overlay is registered at once and the Modal is shown two frames later, after the
 * StatusBar update has reached the activity. Closing is immediate. iOS and web show at once.
 */
const DEFER = Platform.OS === 'android';

export default function OverlayModal({ visible, ...props }) {
  const want = !!visible;
  const [shown, setShown] = useState(want && !DEFER);

  useEffect(() => (want ? overlayOpened() : undefined), [want]);

  useEffect(() => {
    if (!want) { setShown(false); return undefined; }
    if (!DEFER) { setShown(true); return undefined; }
    let raf2;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
  }, [want]);

  return <Modal visible={want && shown} {...props} />;
}
