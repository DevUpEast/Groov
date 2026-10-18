import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { CHANGELOG } from '../data/changelog';
import { t, useLocale } from '../i18n';
import { elevation, space, radius } from '../theme/tokens';
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
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.lg }}>
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
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { fontSize: 20, fontWeight: 'bold' },
  closeBtn: { padding: space.xxs },
  closeTxt: { fontSize: 20, fontWeight: 'bold' },
  entry: { borderTopWidth: 1, paddingVertical: 14 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs },
  version: { fontSize: 16, fontWeight: '800' },
  pill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: '700' },
  date: { fontSize: 12, marginLeft: 'auto' },
  item: { fontSize: 14, lineHeight: 22 },
});
