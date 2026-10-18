import React from 'react';
import { View, Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Animated, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { elevation } from '../theme/tokens';
import { useMotion } from '../theme/motion';
import OverlayModal from './ui/OverlayModal';

// Sheets sit on `raised` (level 2, §2.8): lighter than cards in dark, shadowed in light.
// `translateY` runs 0 (open) .. SHEET_OFFSCREEN (closed), driven by sheetIn/sheetOut/
// sheetSettle from src/theme/motion.js. Under reduced motion the sheet does not slide: the
// same value becomes its opacity, so it fades in 150 ms and fades as it is dragged (F-05).
export default function BottomSheet({ visible, onClose, translateY, backgroundColor, maxHeight = '92%', children }) {
  const { theme } = useApp();
  const motion = useMotion();
  return (
    <OverlayModal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.overlayBg, { backgroundColor: theme.scrim }]} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.sheet, elevation.sheet, { shadowColor: theme.shadow, backgroundColor: backgroundColor ?? theme.raised, maxHeight }, motion.sheetStyle(translateY)]}>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
});
