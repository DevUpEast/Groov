import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { t, useLocale } from '../i18n';

// Small centred dialog to write a note for one habit on one day.
export default function NoteModal({ target, onSave, onClose, theme }) {
  const [text, setText] = useState('');
  useLocale();
  useEffect(() => { setText(target?.note ?? ''); }, [target]);
  if (!target) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{target.habitName}</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>{t('noteModal.sub', { date: target.dateLabel })}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
            value={text}
            onChangeText={setText}
            placeholder={t('noteModal.placeholder')}
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={280}
            autoFocus
            accessibilityLabel={t('noteModal.a11y')}
          />
          <View style={styles.btns}>
            <TouchableOpacity style={[styles.btn, { borderColor: theme.border }]} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.btnText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary, borderColor: theme.primary }]} onPress={() => onSave(text)} accessibilityRole="button">
              <Text style={[styles.btnText, { color: '#fff' }]}>{target.note && !text.trim() ? t('noteModal.removeNote') : t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 20 },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, minHeight: 90, textAlignVertical: 'top', marginBottom: 14 },
  btns: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 14, fontWeight: '600' },
});
