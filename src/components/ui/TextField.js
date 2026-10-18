import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { radius, space } from '../../theme/tokens';
import { type } from '../../theme/typography';
import { announce } from '../../utils/a11y';
import { t, useLocale } from '../../i18n';
import AppText from './AppText';
import { useUiTheme } from './PressableScale';

let nextId = 0;

// The counter shows once the text reaches 80 % of maxLength (plan §3).
export function showCounter(length, maxLength) {
  return !!maxLength && length >= Math.ceil(maxLength * 0.8);
}

/**
 * A labelled text input (plan §3, FRM-2, STA-8).
 * - `label` sits above the field (footnoteStrong, textSecondary) and is the input's
 *   accessibility label (plus `nativeID` / `accessibilityLabelledBy` on Android).
 * - `hint`: a footnote under the field, read as the accessibility hint.
 * - `error`: replaces the hint with a `dangerText` footnote, turns the border `dangerText`,
 *   and is announced once each time it appears or changes. Callers play the `error` haptic.
 * - Focus: a 2 px `selectionBorder` (the border is always 2 px, so nothing moves).
 * - `maxLength`: a counter "12/40" appears at 80 % of the limit, announced as "12 of 40
 *   characters".
 * - `left` / `right`: elements inside the field (an icon, a clear button).
 * - Everything else (`value`, `onChangeText`, `placeholder`, `multiline`, `secureTextEntry`,
 *   `autoComplete`, `textContentType`, `keyboardType`, `returnKeyType`, `onSubmitEditing`,
 *   `autoFocus`...) goes to the TextInput. The ref is the TextInput's (Dialog's
 *   `initialFocusRef` works with it).
 */
const TextField = forwardRef(function TextField({
  label,
  hint,
  error,
  value,
  maxLength,
  left,
  right,
  multiline = false,
  style,
  inputStyle,
  onFocus,
  onBlur,
  accessibilityLabel,
  theme: themeProp,
  testID,
  ...rest
}, ref) {
  useLocale();
  const theme = useUiTheme(themeProp);
  const [focused, setFocused] = useState(false);
  const idRef = useRef(null);
  if (idRef.current == null) idRef.current = `textfield-${++nextId}`;
  const labelId = `${idRef.current}-label`;

  const lastError = useRef(null);
  useEffect(() => {
    if (error && error !== lastError.current) announce(error);
    lastError.current = error || null;
  }, [error]);

  const length = (value || '').length;
  const counter = showCounter(length, maxLength);
  const borderColor = error ? theme.dangerText : focused ? theme.selectionBorder : theme.border;
  const helper = error || hint;

  return (
    <View style={[styles.wrap, style]} testID={testID}>
      {label ? (
        <AppText variant="footnoteStrong" nativeID={labelId} style={[styles.label, { color: theme.textSecondary }]}>{label}</AppText>
      ) : null}
      <View style={[styles.field, multiline && styles.fieldMulti, { borderColor, backgroundColor: theme.bg }]}>
        {left ? <View style={styles.side}>{left}</View> : null}
        <TextInput
          ref={ref}
          {...rest}
          value={value}
          maxLength={maxLength}
          multiline={multiline}
          placeholderTextColor={theme.textTertiary}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          accessibilityLabel={accessibilityLabel || label}
          accessibilityHint={helper || undefined}
          accessibilityLabelledBy={Platform.OS === 'android' && label ? labelId : undefined}
          aria-invalid={error ? true : undefined}
          style={[type.body, styles.input, multiline && styles.inputMulti, { color: theme.text }, inputStyle]}
        />
        {right ? <View style={styles.side}>{right}</View> : null}
      </View>
      {helper || counter ? (
        <View style={styles.below}>
          <AppText
            variant="footnote"
            style={[styles.helper, { color: error ? theme.dangerText : theme.textSecondary }]}
            accessibilityLiveRegion={error ? 'polite' : 'none'}
            importantForAccessibility={error ? 'auto' : 'no'}
          >
            {helper || ''}
          </AppText>
          {counter ? (
            <AppText
              variant="caption"
              style={[styles.counter, { color: length >= maxLength ? theme.dangerText : theme.textSecondary }]}
              accessibilityLabel={t('common.charCount', { count: length, max: maxLength })}
              accessibilityLiveRegion="polite"
            >
              {`${length}/${maxLength}`}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export default TextField;

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  label: { marginBottom: space.xs },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: radius.control, minHeight: 48 },
  fieldMulti: { alignItems: 'flex-start' },
  side: { paddingHorizontal: space.xs },
  // Web: the field's own 2 px border is the focus ring, so the browser outline is dropped.
  input: { flex: 1, paddingHorizontal: space.sm, paddingVertical: space.sm, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  below: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.xxs, gap: space.xs },
  helper: { flex: 1 },
  counter: { fontVariant: ['tabular-nums'] },
});
