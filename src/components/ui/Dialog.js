import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, Pressable, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useApp } from '../../context/AppContext';

/**
 * Shared centred dialog (plan §3). A real `Modal`, so it sits above the tab bar, the scrim covers
 * the whole window, and Android back goes through `onRequestClose` (the Modal consumes the event,
 * so the app's BackHandler never sees it).
 *
 * Props:
 * - `visible`, `onClose` (back, scrim tap)
 * - `title` (announced as a header), `body` (secondary text under the title)
 * - `actions`: [{ label, onPress, variant: 'secondary' | 'primary', disabled, loading, loadingLabel,
 *   accessibilityLabel }]. Rendered in order, so put Cancel first (leading/left).
 * - `dismissable` (default true): false ignores back and scrim taps, e.g. while saving.
 * - `destructive`: the primary action is drawn in the danger colour. A destructive action is never
 *   the default: do not wire it to `onSubmitEditing`.
 * - `initialFocusRef`: a ref to focus once the dialog is shown. Use it instead of `autoFocus`, which
 *   fires before an Android Modal window has focus and leaves the keyboard closed.
 * - `children`: extra content between the body and the actions (inputs, option lists). It scrolls
 *   when the keyboard leaves too little room, so the actions stay visible.
 */
export default function Dialog({
  visible, onClose, title, body, actions = [], dismissable = true, destructive = false, initialFocusRef, children,
}) {
  const { theme } = useApp();
  const requestClose = () => { if (dismissable) onClose?.(); };

  // Android shows the Modal window before it takes input focus; focusing in the same tick is a
  // no-op, so wait briefly after onShow.
  const focusTimer = useRef(null);
  const handleShow = () => {
    if (!initialFocusRef) return;
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => initialFocusRef.current?.focus(), Platform.OS === 'android' ? 150 : 0);
  };
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  useEffect(() => { if (!visible) clearTimeout(focusTimer.current); }, [visible]);

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      onShow={handleShow}
    >
      {/* The scrim sits outside the KeyboardAvoidingView so it keeps covering the whole window
          (tab bar included) while the keyboard shrinks the area the card is centred in. */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        onPress={requestClose}
        accessible={false}
        importantForAccessibility="no"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
        pointerEvents="box-none"
      >
        <View
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
          accessibilityViewIsModal
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {!!title && (
              <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{title}</Text>
            )}
            {!!body && <Text style={[styles.body, { color: theme.textMuted }]}>{body}</Text>}
            {children}
          </ScrollView>
          {actions.length > 0 && (
            <View style={styles.actions}>
              {actions.map((a, i) => {
                const primary = a.variant === 'primary';
                const fill = destructive ? theme.danger : theme.primary;
                const busy = !!a.loading;
                const disabled = !!a.disabled || busy;
                return (
                  <TouchableOpacity
                    key={a.key ?? i}
                    style={[
                      styles.btn,
                      primary
                        ? { backgroundColor: fill, borderColor: fill }
                        : { borderColor: theme.border },
                      disabled && primary && styles.btnDimmed,
                    ]}
                    onPress={a.onPress}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={a.accessibilityLabel ?? a.label}
                    accessibilityState={{ disabled, busy }}
                  >
                    <Text style={[styles.btnText, { color: primary ? theme.onPrimary : theme.textMuted }]}>
                      {busy && a.loadingLabel ? a.loadingLabel : a.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 16 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  body: { fontSize: 13, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDimmed: { opacity: 0.6 },
  btnText: { fontSize: 14, fontWeight: '600' },
});
