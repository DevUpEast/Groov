import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { t, useLocale } from '../i18n';

// Pre-permission screen: explains the value of reminders before the OS dialog,
// which can only be shown once. Rendered from App.js, driven by AppContext.
export default function NotificationPrimer({ visible, onAllow, onLater, theme }) {
  useLocale();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={styles.emoji}>🔔</Text>
          <Text style={[styles.title, { color: theme.text }]}>{t('notificationPrimer.title')}</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            {t('notificationPrimer.body')}
          </Text>
          <View style={styles.bullets}>
            {['only', 'actions', 'change'].map(k => (
              <Text key={k} style={[styles.bullet, { color: theme.text }]}>{t('notificationPrimer.bullet', { text: t(`notificationPrimer.bullets.${k}`) })}</Text>
            ))}
          </View>
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={onAllow} accessibilityRole="button">
            <Text style={styles.btnText}>{t('notificationPrimer.allow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.later} onPress={onLater} accessibilityRole="button">
            <Text style={[styles.laterText, { color: theme.textMuted }]}>{t('common.notNow')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: 'center' },
  emoji: { fontSize: 44, marginBottom: 10 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 14 },
  bullets: { alignSelf: 'stretch', gap: 6, marginBottom: 20 },
  bullet: { fontSize: 14, lineHeight: 20 },
  btn: { alignSelf: 'stretch', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  later: { marginTop: 10, padding: 8 },
  laterText: { fontSize: 14, fontWeight: '600' },
});
