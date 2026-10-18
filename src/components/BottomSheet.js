import { Keyboard, Platform } from 'react-native';
import React from 'react';
import { space } from '../theme/tokens';
import { SheetFrame } from './ui/Sheet';

// Legacy wrapper (F-09a) over the shared `ui/Sheet` frame, for the habit and challenge forms
// that still drive their own `translateY` (sheetIn / sheetOut / sheetSettle from
// src/theme/motion.js) and PanResponder until F-09b moves them onto `Sheet`. The frame gives
// them the `raised` surface, the scrim that fades in step with the sheet, the reduced-motion
// fade and Android back (`onRequestClose`). Their old behaviour is kept on purpose: a scrim tap
// only dismisses the keyboard (no dirty guard yet), the status bar is not translucent (the
// forms' keyboard layout was verified that way) and the bottom padding is unchanged.
// Z-01b deletes this file.
export default function BottomSheet({ visible, onClose, translateY, backgroundColor, maxHeight = '92%', children }) {
  return (
    <SheetFrame
      visible={visible}
      value={translateY}
      onRequestClose={onClose}
      onScrimPress={Keyboard.dismiss}
      backgroundColor={backgroundColor}
      maxHeight={maxHeight}
      statusBarTranslucent={false}
      paddingBottom={Platform.OS === 'ios' ? 40 : space.lg}
    >
      {children}
    </SheetFrame>
  );
}
