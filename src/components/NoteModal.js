import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';

// Small centred dialog to write a note for one habit on one day.
export default function NoteModal({ target, onSave, onClose, theme }) {
  const [text, setText] = useState('');
  useEffect(() => { setText(target?.note ?? ''); }, [target]);
  if (!target) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{target.habitName}</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>{target.dateLabel} · a note for this check-in</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
            value={text}
            onChangeText={setText}
            placeholder="How did it go?"
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={280}
            autoFocus
            accessibilityLabel="Note"
          />
          <View style={styles.btns}>
            <TouchableOpacity style={[styles.btn, { borderColor: theme.border }]} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.btnText, { color: theme.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary, borderColor: theme.primary }]} onPress={() => onSave(text)} accessibilityRole="button">
              <Text style={[styles.btnText, { color: '#fff' }]}>{target.note && !text.trim() ? 'Remove note' : 'Save'}</Text>
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
