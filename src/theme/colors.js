// Theme objects read by every screen as `theme.<key>` (plan §2.1).
//
// This is a thin adapter over src/theme/tokens.js: each theme spreads every role token from
// `palette`, then keeps every legacy key, mapped to its nearest role, so existing consumers
// keep working while screens migrate to role keys ticket by ticket. New code reads role keys
// only; src/theme/__tests__/legacyTokens.test.js counts legacy reads per file and the counts
// may only fall (Z-01a removes the legacy keys).
import { palette } from './tokens';

// Legacy key -> role (or a fixed value for keys that are unused and deleted in Z-01a).
function legacy(p, fixed) {
  return {
    // Secondary text. Light moves from #6B7280 to #475569 (COL-6).
    textMuted: p.textSecondary,
    // F-02 moved every consumer to role keys (fills -> action / meter, text -> link,
    // selected -> selection / onSelection); nothing reads these any more (Z-01a deletes them).
    primary: p.action,
    primaryLight: p.selection,
    // `success` is already a role with the same value as `successText`.
    // `warning` is retired: cautions use textSecondary plus an icon at the call site.
    warning: p.textSecondary,
    // Text meaning. Fills use dangerFill / onDanger.
    danger: p.dangerText,
    tabBar: p.surface,
    tabBarBorder: p.border,
    tabIconActive: p.tabActive,
    tabIconInactive: p.tabInactive,
    progressBarBg: p.track,
    // The label on a `primary` fill: the onAction role (ink in dark).
    onPrimary: p.onAction,
    ...fixed,
  };
}

export const LEGACY_KEYS = [
  'textMuted', 'primary', 'primaryLight', 'primaryDark', 'warning', 'danger',
  'headerBg', 'headerText', 'tabBar', 'tabBarBorder', 'tabIconActive', 'tabIconInactive',
  'progressBarBg', 'cardShadow', 'onPrimary',
];

export const themes = {
  light: {
    ...palette.light,
    ...legacy(palette.light, {
      primaryDark: '#3730A3',
      headerBg: '#4F46E5',
      headerText: '#FFFFFF',
      cardShadow: '#000000',
    }),
  },
  dark: {
    ...palette.dark,
    ...legacy(palette.dark, {
      primaryDark: '#6366F1',
      headerBg: '#1E293B',
      headerText: '#F1F5F9',
      cardShadow: '#000000',
    }),
  },
};
