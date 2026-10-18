import React from 'react';
import { Text, Platform } from 'react-native';
import { type, bodyFor, familyFor } from '../../theme/typography';
import { getLocale, useLocale } from '../../i18n';

const BODY = bodyFor(Platform.OS);

// The string content of `children` (numbers and nested strings), for the face fallback rules.
function plainText(children) {
  let out = '';
  React.Children.forEach(children, (c) => {
    if (typeof c === 'string' || typeof c === 'number') out += c;
    else if (c && c.props && c.props.children != null) out += plainText(c.props.children);
  });
  return out;
}

/**
 * Text in a §2.7 variant: `display`, `displayRing`, `numericSmall`, `title`, `headline`,
 * `body`, `bodyStrong`, `callout`, `footnote`, `footnoteStrong`, `caption`.
 * The face follows `familyFor` (Space Grotesk only for display numerals, system for
 * non-Latin text and Japanese). `style` comes last, so colour and spacing go there; a
 * fontWeight there is dropped on a custom face (the face is the weight).
 */
export default function AppText({ variant = 'body', style, children, ...rest }) {
  useLocale();
  const base = BODY[variant] || type[variant] || type.body;
  const fontFamily = familyFor(plainText(children), getLocale(), variant);
  const merged = fontFamily ? [base, style, { fontFamily, fontWeight: 'normal' }] : [base, style];
  return <Text {...rest} style={merged}>{children}</Text>;
}
