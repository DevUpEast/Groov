import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import feedback, { EVENTS } from '../services/feedback';
import { timeToDate, from24h, formatTimeForClock } from '../utils/time';
import { usesDevice24hClock } from '../utils/clock';
import { themes } from '../theme/colors';
import { t } from '../i18n';
import OverlayModal from './ui/OverlayModal';
import { numeric } from '../theme/typography';

// Native time picker (S-07). Same props and the same { hour12, minute, ampm } result as before,
// so callers did not change.
// - Android: the system time dialog (DateTimePickerAndroid). It follows the device's 12/24-hour
//   setting because is24Hour is left out, is fully accessible to TalkBack, and Back or Cancel
//   dismisses it without saving.
// - iOS: a spinner UIDatePicker inside the app's card with Cancel and Save. UIDatePicker follows
//   the locale and the 24-hour setting on its own; expo-localization is read only for the preview.
// - Web: Metro resolves TimePicker.web.js (the custom wheel), because the package has no web code.

function AndroidTimePicker({ visible, hour12, minute, ampm, onClose, onSave }) {
  // Latest callbacks, so a parent re-render never re-opens the dialog.
  const handlers = useRef({ onClose, onSave });
  handlers.current = { onClose, onSave };

  useEffect(() => {
    if (!visible) return undefined;
    let open = true;
    let cancelled = false;
    DateTimePickerAndroid.open({
      mode: 'time',
      value: timeToDate({ hour12, minute, ampm }),
      onChange: (event, date) => {
        open = false;
        // The cleanup below dismisses the dialog, which fires a late 'dismissed' event; ignore it so
        // it cannot close a picker that was reopened in the meantime.
        if (cancelled) return;
        if (event?.type === 'set' && date) {
          feedback.play(EVENTS.selection);
          handlers.current.onSave(from24h(date));
        }
        handlers.current.onClose();
      },
      // A failed open (e.g. no activity) must still release the caller, or its row stays stuck.
      onError: () => { open = false; if (!cancelled) handlers.current.onClose(); },
    });
    // Closing the parent (a deep link, a tab change) takes the dialog down with it.
    return () => {
      cancelled = true;
      if (open) DateTimePickerAndroid.dismiss('time');
    };
  }, [visible]);

  return null;
}

function IOSTimePicker({ visible, hour12, minute, ampm, onClose, onSave, theme }) {
  const [value, setValue] = useState(() => timeToDate({ hour12, minute, ampm }));
  const uses24h = usesDevice24hClock();

  const handleSave = () => {
    feedback.play(EVENTS.selection);
    onSave(from24h(value));
    onClose();
  };

  return (
    <OverlayModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.scrim }]}>
        <View style={[styles.card, { backgroundColor: theme.overlay }]}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {t('timePicker.title')}
          </Text>
          <Text style={[styles.preview, { color: theme.textSecondary }]}>
            {formatTimeForClock(from24h(value), uses24h)}
          </Text>
          {/* No `locale` on purpose: an explicit locale makes UIDatePicker ignore the 24-hour override. */}
          <DateTimePicker
            mode="time"
            display="spinner"
            value={value}
            onChange={(_, date) => { if (date) setValue(date); }}
            themeVariant={theme === themes.dark ? 'dark' : 'light'}
            textColor={theme.text}
            accessibilityLabel={t('timePicker.a11y')}
            style={styles.spinner}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: theme.controlBorder }]} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.cancelText, { color: theme.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.action }]} onPress={handleSave} accessibilityRole="button">
              <Text style={[styles.saveText, { color: theme.onAction }]}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </OverlayModal>
  );
}

export default function TimePicker(props) {
  return Platform.OS === 'android' ? <AndroidTimePicker {...props} /> : <IOSTimePicker {...props} />;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 24 },
  title: { fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  preview: { fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 6, marginBottom: 8, ...numeric },
  spinner: { alignSelf: 'stretch', marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700' },
});
