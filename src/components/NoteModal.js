import React, { useEffect, useRef, useState } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { t, useLocale } from '../i18n';
import { space, radius } from '../theme/tokens';
import Dialog from './ui/Dialog';

// Small centred dialog to write a note for one habit on one day. On the shared `Dialog` (F-10):
// translucent bars, scrim tap and back close it, and the field gets focus through
// `initialFocusRef` (`autoFocus` does nothing inside an Android Modal).
export default function NoteModal({ target: targetProp, onSave, onClose, theme }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  useLocale();
  useEffect(() => { if (targetProp) setText(targetProp.note ?? ''); }, [targetProp]);
  // The host clears the target as it closes; keep the last one for the fade-out.
  const last = useRef(targetProp);
  if (targetProp) last.current = targetProp;
  const target = targetProp || last.current;
  if (!target) return null;
  return (
    <Dialog
      visible={!!targetProp}
      onClose={onClose}
      title={target.habitName}
      body={t('noteModal.sub', { date: target.dateLabel })}
      initialFocusRef={inputRef}
      actions={[
        { key: 'cancel', label: t('common.cancel'), onPress: onClose },
        { key: 'save', label: target.note && !text.trim() ? t('noteModal.removeNote') : t('common.save'), variant: 'primary', onPress: () => onSave(text) },
      ]}
    >
      <TextInput
        ref={inputRef}
        style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
        value={text}
        onChangeText={setText}
        placeholder={t('noteModal.placeholder')}
        placeholderTextColor={theme.textSecondary}
        multiline
        maxLength={280}
        accessibilityLabel={t('noteModal.a11y')}
      />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.control, padding: space.sm, fontSize: 15, minHeight: 90, textAlignVertical: 'top' },
});
