import React from 'react';
import { View, Modal, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Animated, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { elevation } from '../theme/tokens';
import OverlayModal from './ui/OverlayModal';

// Sheets sit on `raised` (level 2, §2.8): lighter than cards in dark, shadowed in light.
export default function BottomSheet({ visible, onClose, translateY, backgroundColor, maxHeight = '92%', children }) {
  const { theme } = useApp();
  return (
    <OverlayModal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={[styles.overlayBg, { backgroundColor: theme.scrim }]} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.sheet, elevation.sheet, { shadowColor: theme.shadow, backgroundColor: backgroundColor ?? theme.raised, maxHeight, transform: [{ translateY }] }]}>
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
