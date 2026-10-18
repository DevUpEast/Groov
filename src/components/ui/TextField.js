import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { radius, space } from '../../theme/tokens';
import { type } from '../../theme/typography';
import { announce } from '../../utils/a11y';
import { t, useLocale } from '../../i18n';
import AppText from './AppText';
import { useUiTheme } from './PressableScale';

// The counter shows once the text reaches 80 % of maxLength (plan §3).
export function showCounter(length, maxLength) {
  return !!maxLength && length >= Math.ceil(maxLength * 0.8);
}

/**
 * A labelled text input (plan §3, FRM-2, STA-8).
 * - `label` sits above the field (footnoteStrong, textSecondary) and is the input's
 *   accessible name (`accessibilityLabel` overrides it). The visible label is hidden from
 *   screen readers, so it is not read twice.
 * - `hint`: a footnote under the field, read as the input's accessibility hint (the visible
 *   footnote is hidden from screen readers for the same reason).
 * - `error`: replaces the hint with a `dangerText` footnote and turns the border `dangerText`.
 *   It is announced once each time it appears or changes (announce() only, no live region,
 *   so Android does not read it twice) and becomes the hint. Callers play the `error` haptic.
 * - Border: 2 px always (nothing moves): `controlBorder` at rest (the input-outline role,
 *   3.31:1 on bg light, 6.25:1 dark), `selectionBorder` focused, `dangerText` on error.
 * - `maxLength`: a counter "12/40" appears at 80 % of the limit. It is not a live region: the
 *   count ("12 of 40 characters") is part of the input's hint, read on focus, and reaching
 *   the limit is announced once.
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

  const lastError = useRef(null);
  useEffect(() => {
    if (error && error !== lastError.current) announce(error);
    lastError.current = error || null;
  }, [error]);

  const length = (value || '').length;
  const counter = showCounter(length, maxLength);
  const countText = counter ? t('common.charCount', { count: length, max: maxLength }) : null;

  // Reaching the limit is announced once (not on every keystroke past 80 %).
  const atLimit = !!maxLength && length >= maxLength;
  const wasAtLimit = useRef(atLimit);
  useEffect(() => {
    if (atLimit && !wasAtLimit.current) announce(t('common.charCount', { count: length, max: maxLength }));
    wasAtLimit.current = atLimit;
  }, [atLimit, length, maxLength]);

  const borderColor = error ? theme.dangerText : focused ? theme.selectionBorder : theme.controlBorder;
  const helper = error || hint;
  const a11yHint = [helper, countText].filter(Boolean).join('. ') || undefined;
  const hidden = { importantForAccessibility: 'no', accessibilityElementsHidden: true };

  return (
    <View style={[styles.wrap, style]} testID={testID}>
      {label ? (
        <AppText variant="footnoteStrong" {...hidden} style={[styles.label, { color: theme.textSecondary }]}>{label}</AppText>
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
          accessibilityHint={a11yHint}
          aria-invalid={error ? true : undefined}
          style={[type.body, styles.input, multiline && styles.inputMulti, { color: theme.text }, inputStyle]}
        />
        {right ? <View style={styles.side}>{right}</View> : null}
      </View>
      {helper || counter ? (
        <View style={styles.below} {...hidden}>
          <AppText
            variant="footnote"
            testID="textfield-helper"
            style={[styles.helper, { color: error ? theme.dangerText : theme.textSecondary }]}
          >
            {helper || ''}
          </AppText>
          {counter ? (
            <AppText
              variant="caption"
              testID="textfield-counter"
              style={[styles.counter, { color: atLimit ? theme.dangerText : theme.textSecondary }]}
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
