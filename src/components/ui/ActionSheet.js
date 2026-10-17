import React, { useEffect, useRef } from 'react';
import {
  ActionSheetIOS, Modal, View, Text, Pressable, TouchableOpacity, Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { lightImpact } from '../../utils/haptics';
import { t, useLocale } from '../../i18n';

/**
 * Shared action sheet (plan §3). Replaces multi-button `Alert.alert` menus, which on Android show
 * at most 3 buttons (so a 4th, usually Cancel, is dropped) and ignore the back button.
 *
 * - iOS: the native `ActionSheetIOS` sheet, with Cancel as `cancelButtonIndex`.
 * - Android and web: a bottom list in a transparent `Modal`, with a Cancel row. Back
 *   (`onRequestClose`), a scrim tap and Cancel all close it.
 * - A light haptic plays when it opens.
 *
 * Props:
 * - `visible`, `title`, `message` (optional secondary line)
 * - `options`: [{ label, onPress, destructive? }]
 * - `onCancel`: hides the sheet. Called on Cancel, back and scrim, and also right before an
 *   option's `onPress`, so the caller only keeps one piece of state.
 */
export default function ActionSheet({ visible, title, message, options = [], onCancel }) {
  useLocale();
  const { theme } = useApp();
  const insets = useSafeAreaInsets();
  const native = Platform.OS === 'ios';

  // Keep the latest props for the iOS callback, which fires after the sheet has gone.
  const latest = useRef({ options, onCancel });
  latest.current = { options, onCancel };

  useEffect(() => {
    if (!visible) return;
    lightImpact();
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
        cancel?.();
        if (index < cur.length) cur[index]?.onPress?.();
      },
    );
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (native) return null;

  const choose = (option) => {
    onCancel?.();
    option.onPress?.();
  };

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => onCancel?.()}
    >
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        onPress={() => onCancel?.()}
        testID="actionsheet-scrim"
        accessible={false}
        importantForAccessibility="no"
      />
      <View style={styles.anchor} pointerEvents="box-none">
        <View
          style={[
            styles.panel,
            { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: 8 + insets.bottom },
          ]}
          accessibilityViewIsModal
          onAccessibilityEscape={() => onCancel?.()}
        >
          {(!!title || !!message) && (
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
              {!!title && (
                <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header" numberOfLines={2}>
                  {title}
                </Text>
              )}
              {!!message && <Text style={[styles.message, { color: theme.textMuted }]}>{message}</Text>}
            </View>
          )}
          {options.map((o, i) => (
            <TouchableOpacity
              key={o.key ?? i}
              style={styles.row}
              onPress={() => choose(o)}
              accessibilityRole="button"
              accessibilityLabel={o.label}
            >
              <Text style={[styles.rowText, { color: o.destructive ? theme.danger : theme.text }]}>{o.label}</Text>
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
            <Text style={[styles.rowText, styles.cancelText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 8,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 17, fontWeight: '700' },
  message: { fontSize: 13, marginTop: 4 },
  row: { minHeight: 56, paddingHorizontal: 24, justifyContent: 'center' },
  rowText: { fontSize: 16 },
  cancelText: { fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 24 },
});
