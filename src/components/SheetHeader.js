import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { t } from '../i18n';

export function SheetDragHandle({ panHandlers, theme, color }) {
  return (
    <View {...panHandlers} style={styles.dragHandleArea}>
      <View style={[styles.handleBar, { backgroundColor: color ?? theme.border }]} />
    </View>
  );
}

export function SheetHeader({ title, onClose, panHandlers, theme }) {
  return (
    <>
      <SheetDragHandle panHandlers={panHandlers} theme={theme} />
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Text style={[styles.closeTxt, { color: theme.textSecondary }]}>✕</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  dragHandleArea: { alignItems: 'center', paddingVertical: 12 },
  handleBar: { width: 40, height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  closeTxt: { fontSize: 20, fontWeight: 'bold' },
});
