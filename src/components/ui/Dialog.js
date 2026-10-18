import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, Pressable, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useApp } from '../../context/AppContext';
import { elevation } from '../../theme/tokens';
import OverlayModal from './OverlayModal';

/**
 * Shared centred dialog (plan §3). A real `Modal`, so it sits above the tab bar, the scrim covers
 * the whole window, and Android back goes through `onRequestClose` (the Modal consumes the event,
 * so the app's BackHandler never sees it).
 *
 * Props:
 * - `visible`, `onClose` (back, scrim tap, VoiceOver escape)
 * - `onDismiss`: runs once the dialog has fully gone. Show any follow-up `Alert` here, never in the
 *   same tick as closing (iOS cannot present an alert over a Modal that is still dismissing). iOS and
 *   web use the Modal's own `onDismiss`; Android has none, so it runs after `visible` turns false.
 * - `title` (announced as a header), `body` (secondary text under the title)
 * - `actions`: [{ label, onPress, variant: 'secondary' | 'primary' | 'destructive', disabled, loading,
 *   loadingLabel, accessibilityLabel }]. `primary` is the action fill with its onAction label (ink
 *   in dark); `destructive` is the danger fill with onDanger. Rendered in order, so put Cancel first
 *   (leading/left). A disabled action of any variant is dimmed.
 * - `layout`: 'auto' (default) | 'row' | 'stack'. Auto stacks the buttons full-width when there are
 *   3 or more actions or a label is longer than STACK_LABEL_CHARS (long de/fr labels would wrap or
 *   clip side by side). Stacked, the order is reversed so the main action is on top and Cancel last.
 * - `dismissable` (default true): false ignores back, scrim taps and the escape gesture, e.g. while
 *   saving.
 * - `destructive`: legacy shorthand, draws every `primary` action as `destructive`. Prefer the
 *   per-action variant. A destructive action is never the default: do not wire it to
 *   `onSubmitEditing`.
 * - `initialFocusRef`: a ref to focus once the dialog is shown. Use it instead of `autoFocus`, which
 *   fires before an Android Modal window has focus and leaves the keyboard closed. On Android the
 *   focus lands 150 ms after `onShow`, with one retry at 300 ms if the field is still not focused.
 * - `children`: extra content between the body and the actions (inputs, option lists). It scrolls
 *   when the keyboard leaves too little room, so the actions stay visible.
 */
const FOCUS_DELAY_MS = 150;
const FOCUS_RETRY_MS = 300;
// Two buttons share about 135 pt at 375 pt wide; past this many characters a 14 pt label wraps.
export const STACK_LABEL_CHARS = 16;

export function shouldStack(actions, layout = 'auto') {
  if (layout === 'stack') return true;
  if (layout === 'row') return false;
  return actions.length >= 3 || actions.some(a => String(a.label ?? '').length > STACK_LABEL_CHARS);
}

export default function Dialog({
  visible, onClose, onDismiss, title, body, actions = [], dismissable = true, destructive = false,
  initialFocusRef, children, layout = 'auto',
}) {
  const { theme } = useApp();
  const requestClose = () => { if (dismissable) onClose?.(); };

  // Android shows the Modal window before it takes input focus; focusing in the same tick is a
  // no-op, so wait briefly after onShow and retry once if focus did not land (slow devices).
  const focusTimer = useRef(null);
  const handleShow = () => {
    if (!initialFocusRef) return;
    clearTimeout(focusTimer.current);
    if (Platform.OS !== 'android') {
      focusTimer.current = setTimeout(() => initialFocusRef.current?.focus(), 0);
      return;
    }
    focusTimer.current = setTimeout(() => {
      initialFocusRef.current?.focus();
      focusTimer.current = setTimeout(() => {
        const field = initialFocusRef.current;
        if (field && field.isFocused && !field.isFocused()) field.focus();
      }, FOCUS_RETRY_MS - FOCUS_DELAY_MS);
    }, FOCUS_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(focusTimer.current), []);

  // onDismiss: Android's Modal has no onDismiss, so fire it once visible turns false.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const wasVisible = useRef(!!visible);
  useEffect(() => {
    if (!visible) clearTimeout(focusTimer.current);
    if (wasVisible.current && !visible && Platform.OS === 'android') onDismissRef.current?.();
    wasVisible.current = !!visible;
  }, [visible]);
  const handleModalDismiss = Platform.OS === 'android' ? undefined : () => onDismissRef.current?.();
  const stacked = shouldStack(actions, layout);

  return (
    <OverlayModal
      visible={!!visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
      onShow={handleShow}
      onDismiss={handleModalDismiss}
    >
      {/* The scrim sits outside the KeyboardAvoidingView so it keeps covering the whole window
          (tab bar included) while the keyboard shrinks the area the card is centred in. */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        onPress={requestClose}
        testID="dialog-scrim"
        accessible={false}
        importantForAccessibility="no"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
        pointerEvents="box-none"
      >
        <View
          style={[styles.card, elevation.dialog, { backgroundColor: theme.overlay, borderColor: theme.border, shadowColor: theme.shadow }]}
          accessibilityViewIsModal
          onAccessibilityEscape={requestClose}
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
            {!!body && <Text style={[styles.body, { color: theme.textSecondary }]}>{body}</Text>}
            {children}
          </ScrollView>
          {actions.length > 0 && (
            <View style={stacked ? styles.actionsStacked : styles.actions} testID={stacked ? 'dialog-actions-stacked' : 'dialog-actions'}>
              {(stacked ? [...actions].reverse() : actions).map((a, i) => {
                const variant = a.variant === 'primary' && destructive ? 'destructive' : (a.variant || 'secondary');
                const fill = variant === 'destructive' ? theme.dangerFill : variant === 'primary' ? theme.action : null;
                const onFill = variant === 'destructive' ? theme.onDanger : theme.onAction;
                const busy = !!a.loading;
                const disabled = !!a.disabled || busy;
                return (
                  <TouchableOpacity
                    key={a.key ?? a.label ?? i}
                    style={[
                      styles.btn,
                      stacked && styles.btnStacked,
                      fill
                        ? { backgroundColor: fill, borderColor: fill }
                        : { borderColor: theme.controlBorder },
                      disabled && styles.btnDimmed,
                    ]}
                    onPress={a.onPress}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={a.accessibilityLabel ?? a.label}
                    accessibilityState={{ disabled, busy }}
                    testID={`dialog-action-${variant}`}
                  >
                    <Text style={[styles.btnText, { color: fill ? onFill : theme.text }]}>
                      {busy && a.loadingLabel ? a.loadingLabel : a.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </OverlayModal>
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
  actionsStacked: { gap: 10 },
  btn: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStacked: { flex: 0, alignSelf: 'stretch', paddingHorizontal: 16 },
  btnDimmed: { opacity: 0.45 },
  btnText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
