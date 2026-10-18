import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { CHANGELOG } from '../data/changelog';
import { t, useLocale } from '../i18n';
import { elevation } from '../theme/tokens';
import OverlayModal from './ui/OverlayModal';

export default function WhatsNewSheet({ visible, onClose, theme, currentVersion }) {
  useLocale();
  if (!visible) return null;
  return (
    <OverlayModal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.scrim }]}>
        <View style={[styles.sheet, elevation.sheet, { backgroundColor: theme.raised, shadowColor: theme.shadow }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{t('whatsNew.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={[styles.closeTxt, { color: theme.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {CHANGELOG.map(entry => (
              <View key={entry.version} style={[styles.entry, { borderColor: theme.border }]}>
                <View style={styles.entryHeader}>
                  <Text style={[styles.version, { color: theme.link }]}>v{entry.version}</Text>
                  {entry.version === currentVersion && (
                    <View style={[styles.pill, { backgroundColor: theme.selection, borderColor: theme.selectionBorder }]}>
                      <Text style={[styles.pillText, { color: theme.onSelection }]}>{t('whatsNew.current')}</Text>
                    </View>
                  )}
                  <Text style={[styles.date, { color: theme.textSecondary }]}>{entry.date}</Text>
                </View>
                {entry.items.map(item => (
                  <Text key={item} style={[styles.item, { color: theme.text }]}>{t('whatsNew.item', { text: item })}</Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  closeTxt: { fontSize: 20, fontWeight: 'bold' },
  entry: { borderTopWidth: 1, paddingVertical: 14 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  version: { fontSize: 16, fontWeight: '800' },
  pill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, marginLeft: 'auto' },
  item: { fontSize: 14, lineHeight: 22 },
});
