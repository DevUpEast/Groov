import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CHANGELOG } from '../data/changelog';
import { t, useLocale } from '../i18n';
import { space, radius } from '../theme/tokens';
import Sheet from './ui/Sheet';

// The changelog, from Settings → About. A `Sheet` (F-10) that fits its content.
export default function WhatsNewSheet({ visible, onClose, theme, currentVersion }) {
  useLocale();
  return (
    <Sheet visible={!!visible} onClose={onClose} title={t('whatsNew.title')} theme={theme} contentContainerStyle={styles.body} testID="whatsnew-sheet">
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
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: space.xs },
  entry: { borderTopWidth: 1, paddingVertical: 14 },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs },
  version: { fontSize: 16, fontWeight: '800' },
  pill: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: '700' },
  date: { fontSize: 12, marginLeft: 'auto' },
  item: { fontSize: 14, lineHeight: 22 },
});
