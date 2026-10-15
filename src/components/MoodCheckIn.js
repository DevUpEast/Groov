import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MOODS } from '../utils/mood';
import { lightImpact } from '../utils/haptics';
import { t, useLocale } from '../i18n';

// One-tap daily mood row for the Today screen. Tapping the selected mood clears it.
export default function MoodCheckIn({ value, onChange, theme, haptics = true }) {
  useLocale();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>{t('moodCheckIn.title')}</Text>
        {value ? (
          <Text style={[styles.sub, { color: theme.textMuted }]}>{MOODS.find(m => m.value === value)?.label}</Text>
        ) : (
          <Text style={[styles.sub, { color: theme.textMuted }]}>{t('moodCheckIn.optional')}</Text>
        )}
      </View>
      <View style={styles.row} accessibilityRole="radiogroup">
        {MOODS.map(m => {
          const on = value === m.value;
          return (
            <TouchableOpacity
              key={m.value}
              style={[styles.btn, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryLight : theme.bg }]}
              onPress={() => { if (haptics) lightImpact(); onChange(on ? null : m.value); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={t('moodCheckIn.a11y', { label: m.label, value: m.value })}
              activeOpacity={0.7}
            >
              <Text style={[styles.emoji, !on && value ? styles.dim : null]}>{m.emoji}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 20 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { width: 52, height: 48, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
  dim: { opacity: 0.45 },
});
