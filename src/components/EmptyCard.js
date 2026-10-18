import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { space, radius } from '../theme/tokens';

export default function EmptyCard({ emoji, title, body, theme, style, children, titleColor }) {
  return (
    <View style={[styles.card, { borderColor: theme.border }, style]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: titleColor ?? theme.text }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>{body}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    padding: 36, alignItems: 'center', marginTop: space.lg,
  },
  emoji: { fontSize: 40, marginBottom: space.sm },
  title: { fontSize: 18, fontWeight: '700', marginBottom: space.xs },
  body: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
});
