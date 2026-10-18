// Web-only time picker. @react-native-community/datetimepicker has no web implementation, so
// Metro resolves this file for the web export (and the iOS mockup) and keeps the custom wheel.
// Android and iOS use the native picker in TimePicker.js.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView,
  Animated, Easing,
} from 'react-native';
import feedback, { EVENTS } from '../services/feedback';
import { t } from '../i18n';
import OverlayModal from './ui/OverlayModal';

const ITEM_H = 50;
const VISIBLE = 5;  // rows shown in wheel
const CONTAINER_H = ITEM_H * VISIBLE;
const PADDING = ITEM_H * 2;  // top+bottom padding so center is selectable

// Hours 1–12
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
// Minutes 00–59 — tripled for infinite-loop illusion
const MINUTES_BASE = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_LOOP = [...MINUTES_BASE, ...MINUTES_BASE, ...MINUTES_BASE];
const PERIODS = ['AM', 'PM'];

// ─── Single wheel column ──────────────────────────────────────────────────────

function WheelColumn({ items, selectedValue, onValueChange, loop, theme, width }) {
  const ref = useRef(null);
  const skipEffect = useRef(false);
  const lastEmitted = useRef(selectedValue);

  // For loop mode: the real items are the middle third of `items`
  const baseItems = loop ? MINUTES_BASE : items;
  const baseCount = baseItems.length;
  const startOffset = loop ? baseCount : 0;  // index where middle copy starts

  const selectedIndex = useMemo(() => {
    const i = baseItems.indexOf(selectedValue);
    return i >= 0 ? i : 0;
  }, [baseItems, selectedValue]);

  // For loop: initial scroll to middle copy, otherwise to index
  const initialY = (startOffset + selectedIndex) * ITEM_H;

  // Mount: scroll to initial position after layout
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: initialY, animated: false });
    }, 80);
    return () => clearTimeout(t);
  }, []);

  // When selected changes externally (e.g. typing in old text input), scroll to it
  useEffect(() => {
    if (skipEffect.current) { skipEffect.current = false; return; }
    const targetY = (startOffset + selectedIndex) * ITEM_H;
    ref.current?.scrollTo({ y: targetY, animated: true });
  }, [selectedIndex, startOffset]);

  const onEnd = (e) => {
    let y = Math.round(Math.max(0, e.nativeEvent.contentOffset.y));
    const rawIdx = Math.round(y / ITEM_H);

    if (loop) {
      // Map back to base range [0, baseCount-1]
      const baseIdx = ((rawIdx % baseCount) + baseCount) % baseCount;
      const val = baseItems[baseIdx];

      // If too close to edge, silently jump to middle copy
      const totalItems = items.length; // = baseCount * 3
      const middle = baseCount; // start of middle copy
      const shouldJump = rawIdx < baseCount * 0.5 || rawIdx > baseCount * 2.5;
      if (shouldJump) {
        ref.current?.scrollTo({ y: (middle + baseIdx) * ITEM_H, animated: false });
      }

      if (val !== lastEmitted.current) {
        lastEmitted.current = val;
        skipEffect.current = true;
        feedback.play(EVENTS.selection);
        onValueChange(val);
      }
    } else {
      const idx = Math.max(0, Math.min(items.length - 1, rawIdx));
      const val = items[idx];
      if (val !== lastEmitted.current) {
        lastEmitted.current = val;
        skipEffect.current = true;
        feedback.play(EVENTS.selection);
        onValueChange(val);
      }
    }
  };

  const displayItems = loop ? items : items;

  return (
    <View style={{ width, height: CONTAINER_H, overflow: 'hidden' }}>
      {/* iOS-style selection band */}
      <View pointerEvents="none" style={{
        position: 'absolute',
        top: ITEM_H * 2,
        left: 0, right: 0,
        height: ITEM_H,
        backgroundColor: theme.border,
        borderRadius: 8,
        opacity: 0.6,
      }} />

      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={onEnd}
        onScrollEndDrag={onEnd}
        contentContainerStyle={{ paddingTop: ITEM_H * 2, paddingBottom: ITEM_H * 2 }}
      >
        {displayItems.map((item, i) => {
          const isSelected = item === selectedValue;
          // For loop mode, determine distance from selected in the visible middle range
          const distance = Math.abs(i - (startOffset + selectedIndex));
          const opacity = distance === 0 ? 1 : distance === 1 ? 0.55 : 0.3;
          const fontSize = distance === 0 ? 22 : 17;
          return (
            <View key={i} style={{ height: ITEM_H, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{
                fontSize,
                fontWeight: isSelected ? '700' : '400',
                fontVariant: ['tabular-nums'],
                color: theme.text,
                opacity,
              }}>
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Top fade */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fadeTop, { backgroundColor: theme.overlay }]} />
      {/* Bottom fade */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fadeBottom, { backgroundColor: theme.overlay }]} />
    </View>
  );
}

// ─── Main TimePicker ──────────────────────────────────────────────────────────

export default function TimePicker({ visible, hour12, minute, ampm, onClose, onSave, theme }) {
  const [h, setH] = useState(String(hour12));
  const [m, setM] = useState(String(minute).padStart(2, '0'));
  const [period, setPeriod] = useState(ampm);

  const hSafe = String(Math.min(12, Math.max(1, parseInt(h) || 1)));
  const mSafe = String(Math.min(59, Math.max(0, parseInt(m) || 0))).padStart(2, '0');

  const handleSave = () => {
    const safeH = Math.min(12, Math.max(1, parseInt(h) || 12));
    const safeM = Math.min(59, Math.max(0, parseInt(m) || 0));
    feedback.play(EVENTS.selection);
    onSave({ hour12: safeH, minute: safeM, ampm: period });
    onClose();
  };

  return (
    <OverlayModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.scrim }]}>
        <View style={[styles.card, { backgroundColor: theme.overlay }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t('timePicker.title')}</Text>

          <View style={styles.wheelsRow} accessible={true} accessibilityLabel={t('timePicker.a11y')}>
            {/* Hour wheel */}
            <View style={styles.wheelCol}>
              <WheelColumn
                items={HOURS}
                selectedValue={hSafe}
                onValueChange={setH}
                loop={false}
                theme={theme}
                width={72}
              />
              <Text style={[styles.colLabel, { color: theme.textSecondary }]}>{t('timePicker.hour')}</Text>
            </View>

            <Text style={[styles.colon, { color: theme.text }]}>:</Text>

            {/* Minute wheel — infinite loop */}
            <View style={styles.wheelCol}>
              <WheelColumn
                items={MINUTES_LOOP}
                selectedValue={mSafe}
                onValueChange={setM}
                loop={true}
                theme={theme}
                width={72}
              />
              <Text style={[styles.colLabel, { color: theme.textSecondary }]}>{t('timePicker.minute')}</Text>
            </View>

            {/* AM/PM wheel */}
            <View style={styles.wheelCol}>
              <WheelColumn
                items={PERIODS}
                selectedValue={period}
                onValueChange={setPeriod}
                loop={false}
                theme={theme}
                width={72}
              />
              <Text style={[styles.colLabel, { color: theme.textSecondary }]}>{t('timePicker.ampm')}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: theme.border }]} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.action }]} onPress={handleSave} accessibilityRole="button">
              <Text style={[styles.saveText, { color: theme.onAction }]}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%', maxWidth: 340, borderRadius: 20, padding: 24,
  },
  title: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  wheelsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, marginBottom: 24,
  },
  wheelCol: { alignItems: 'center', gap: 6 },
  colLabel: { fontSize: 12, fontWeight: '600' },
  colon: { fontSize: 26, fontWeight: 'bold', marginBottom: 22 },
  fadeTop: {
    bottom: '60%',
    opacity: 0.85,
  },
  fadeBottom: {
    top: '60%',
    opacity: 0.85,
  },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700' },
});
