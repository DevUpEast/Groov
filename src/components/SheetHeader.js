import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { t } from '../i18n';
import IconButton from './ui/IconButton';
import { space, radius } from '../theme/tokens';

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
        <IconButton icon="close" iconSize={24} theme={theme} onPress={onClose} accessibilityLabel={t('common.close')} style={styles.closeBtn} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  dragHandleArea: { alignItems: 'center', paddingVertical: space.sm },
  handleBar: { width: 40, height: 4, borderRadius: radius.pill },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: 'bold' },
  // The 40 pt button's icon lines up with the sheet's content edge.
  closeBtn: { marginRight: -space.xs },
});
