import React, { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS, View, Text, TouchableOpacity, Platform, StyleSheet,
} from 'react-native';
import feedback, { EVENTS } from '../../services/feedback';
import { t, useLocale } from '../../i18n';
import { space } from '../../theme/tokens';
import Sheet from './Sheet';
import { useUiTheme } from './PressableScale';

/**
 * Shared action sheet (plan §3). Replaces multi-button `Alert.alert` menus, which on Android show
 * at most 3 buttons (so a 4th, usually Cancel, is dropped) and ignore the back button.
 *
 * - iOS: the native `ActionSheetIOS` sheet, with Cancel as `cancelButtonIndex`.
 * - Android and web: a bottom list on the shared `Sheet` (F-10: grabber, drag to close, scrim,
 *   translucent bars), with a Cancel row. Back, a scrim tap, a drag and Cancel all close it.
 * - The longPress feedback (iOS medium impact, Android Long_Press) plays when it opens, unless
 *   `haptic={false}` (opened from a plain button such as a card's "⋯", which is silent, §2.10).
 *
 * Props:
 * - `visible`, `title`, `message` (optional secondary line)
 * - `options`: [{ label, onPress, destructive?, afterClose? }]. `afterClose`: run `onPress` once
 *   the sheet has gone (an option that opens another overlay; on iOS the native callback
 *   already fires after the sheet is gone).
 * - Each open runs at most one option, however fast the taps.
 * - `onCancel`: hides the sheet. Called on Cancel, back and scrim, and also right before an
 *   option's `onPress`, so the caller only keeps one piece of state.
 */
export default function ActionSheet({ visible, title, message, options = [], onCancel, haptic = true }) {
  useLocale();
  const theme = useUiTheme();
  const native = Platform.OS === 'ios';
  // What the sheet shows while it plays its exit: the host may clear its menu as it closes.
  const last = useRef({ title, message, options });
  if (visible) last.current = { title, message, options };
  // Every habit card holds one; the Sheet (and its keyboard listeners) exists only from an open
  // until its exit has finished.
  const [inUse, setInUse] = useState(!!visible);
  if (visible && !inUse) setInUse(true);

  // Keep the latest props for the iOS callback, which fires after the sheet has gone.
  const latest = useRef({ options, onCancel });
  latest.current = { options, onCancel };

  // At most one option runs per open: a second tap landing during the fade-out would otherwise
  // run a toggle twice (undoing it). Re-armed each time the sheet opens.
  const fired = useRef(false);
  // An `afterClose` option waiting for the exit to finish.
  const pending = useRef(null);

  useEffect(() => {
    if (!visible) return;
    fired.current = false;
    // A reopen during the exit (Sheet springs back, no dismiss) drops an afterClose option
    // picked before it, so it can never run on a later Cancel.
    pending.current = null;
    if (haptic) feedback.play(EVENTS.longPress);
    if (!native) return;
    const opts = latest.current.options;
    const destructiveButtonIndex = opts
      .map((o, i) => (o.destructive ? i : -1))
      .filter(i => i >= 0);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...opts.map(o => o.label), t('common.cancel')],
        cancelButtonIndex: opts.length,
        destructiveButtonIndex: destructiveButtonIndex.length ? destructiveButtonIndex : undefined,
      },
      (index) => {
        const { options: cur, onCancel: cancel } = latest.current;
        if (fired.current) return;
        fired.current = true;
        cancel?.();
        if (index < cur.length) cur[index]?.onPress?.();
      },
    );
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (native || !inUse) return null;

  const choose = (option) => {
    if (fired.current) return;
    fired.current = true;
    onCancel?.();
    if (option.afterClose) pending.current = option;
    else option.onPress?.();
  };
  const handleDismiss = () => {
    setInUse(false);
    const next = pending.current;
    pending.current = null;
    next?.onPress?.();
  };

  const shown = visible ? { title, message, options } : last.current;
  const header = (shown.title || shown.message) ? ({ titleRef }) => (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      {!!shown.title && (
        <Text ref={titleRef} style={[styles.title, { color: theme.text }]} accessibilityRole="header" numberOfLines={2}>
          {shown.title}
        </Text>
      )}
      {!!shown.message && <Text style={[styles.message, { color: theme.textSecondary }]}>{shown.message}</Text>}
    </View>
  ) : undefined;

  return (
    <Sheet
      visible={!!visible}
      onClose={() => onCancel?.()}
      onDismiss={handleDismiss}
      header={header}
      accessibilityLabel={shown.title}
      theme={theme}
      testID="actionsheet"
    >
      {shown.options.map((o, i) => (
        <TouchableOpacity
          key={o.key ?? i}
          style={styles.row}
          onPress={() => choose(o)}
          accessibilityRole="button"
          accessibilityLabel={o.label}
        >
          <Text style={[styles.rowText, { color: o.destructive ? theme.dangerText : theme.text }]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <TouchableOpacity
        style={styles.row}
        onPress={() => onCancel?.()}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        testID="actionsheet-cancel"
      >
        <Text style={[styles.rowText, styles.cancelText, { color: theme.textSecondary }]}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Rows and the header run edge to edge: the sheet pads its content by space.lg.
  header: { marginHorizontal: -space.lg, paddingHorizontal: space.lg, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '700' },
  message: { fontSize: 13, marginTop: space.xxs },
  row: { minHeight: 56, marginHorizontal: -space.lg, paddingHorizontal: space.lg, justifyContent: 'center' },
  rowText: { fontSize: 16 },
  cancelText: { fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth },
});
