// Groov design tokens (plan §2). The single source of every colour, space, radius, size and
// elevation value. Screens read colours through `theme.<role>` (src/theme/colors.js spreads
// `palette` into the theme objects); non-React consumers (widget, notifications, share cards)
// import this file directly.
//
// Rules the token test enforces (src/theme/__tests__/tokens.test.js):
// - light and dark declare the same role keys;
// - opaque roles are 6-digit upper-case hex (`/^#[0-9A-F]{6}$/`), so no consumer can append
//   an alpha suffix to them; the few rgba roles are listed in RGBA_ROLES;
// - every entry in `pairs` meets its threshold (4.5 text, 3 large text and non-text).
//
// Pure module: no React Native imports.

import { ACCENTS, ACCENT_ON_FILL } from './accents';

const light = {
  // Surfaces (level 0 to 3, §2.8)
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  raised: '#FFFFFF',
  overlay: '#FFFFFF',
  well: '#F1F5F9',
  // Brand strip (Today progress strip, welcome hero)
  brandSurface: '#E0E7FF',
  brandInk: '#3730A3',
  brandTrack: '#C7D2FE',
  // Beat-row outlines on brandSurface (D-00 r6). controlBorder is only 2.81:1 there.
  beatOutline: '#3730A3',
  // Text
  text: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#64748B',
  // Lines
  border: '#E2E8F0',
  controlBorder: '#7C8BA0',
  track: '#E2E8F0',
  // Primary action (buttons, FAB, capsule add)
  action: '#4F46E5',
  onAction: '#FFFFFF',
  actionPressed: '#4338CA',
  actionTint: '#EEF2FF',
  onActionTint: '#3730A3',
  // Full-bleed brand ground (onboarding). Light: the action indigo with an inverted white CTA.
  // Dark: the deep brand surface, so the CTA is the normal #818CF8 action with an ink label
  // (a #818CF8 ground would leave the CTA nowhere to go; white-on-#818CF8 is 2.98:1, COL-1).
  brandGround: '#4F46E5',
  onBrandGround: '#FFFFFF',
  onBrandGroundSecondary: '#E0E7FF',
  brandGroundCta: '#FFFFFF',
  onBrandGroundCta: '#4F46E5',
  link: '#4338CA',
  // Selection (chips, segments, selected rows)
  selection: '#EEF2FF',
  onSelection: '#3730A3',
  selectionBorder: '#4F46E5',
  // Indigo meters: progress-bar fills, the slider, weekday bars (non-interactive, not a CTA)
  meter: '#4F46E5',
  onMeter: '#FFFFFF',
  // Label on a challenge-tier colour (banner, badges); X-02 replaces the tier palette.
  onTier: '#0F172A',
  // Glyph on a habit accent fill (check, counter +): ACCENT_ON_FILL from accents.js (§2.3)
  onAccent: ACCENT_ON_FILL.light,
  // Success: the ring arc, the heat-map ramp and "Logged" text only
  success: '#15803D',
  onSuccess: '#FFFFFF',
  successText: '#15803D',
  // Danger
  dangerText: '#B91C1C',
  dangerFill: '#DC2626',
  onDanger: '#FFFFFF',
  dangerTint: '#FEF2F2',
  // Signature gold (streak flame, day-complete ring, milestones)
  signature: '#B07400',
  signatureText: '#8A5A00',
  signatureTint: '#FFF8E6',
  // Tab bar
  tabActive: '#4F46E5',
  tabInactive: '#64748B',
  // Snackbar
  toast: '#1E293B',
  onToast: '#F8FAFC',
  toastAction: '#A5B4FC',
  toastEdge: '#1E293B',
  // Disabled
  disabledContainer: '#E2E8F0',
  onDisabled: '#475569',
  // Full-screen celebration (trophy, challenge rewards): its own darker scrim, white text
  onCelebration: '#FFFFFF',
  onCelebrationSecondary: '#CBD5E1',
  // Switch, off state: the thumb and its track (on = onAction thumb on the action track).
  // Dark mutes the off thumb so an off row does not outshine an on one (F-02 S3).
  switchThumb: '#FFFFFF',
  switchTrackOff: '#7C8BA0',
  // Sign in with Apple button (Apple HIG: black on light, white on dark)
  appleButton: '#000000',
  onAppleButton: '#FFFFFF',
  // Translucent roles (rgba by design)
  scrim: 'rgba(15,23,42,0.40)',
  pressedOverlay: 'rgba(15,23,42,0.08)',
  ripple: 'rgba(15,23,42,0.12)',
  celebrationScrim: 'rgba(0,0,0,0.70)',
  // Shadow colour for the elevation recipes
  shadow: '#0F172A',
};

const dark = {
  bg: '#0F172A',
  surface: '#1E293B',
  raised: '#2C3647',
  overlay: '#394353',
  well: '#0F172A',
  brandSurface: '#1E1B4B',
  brandInk: '#8B9AB0',
  brandTrack: '#312E81',
  beatOutline: '#8B9AB0',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textTertiary: '#A3B1C5',
  border: '#334155',
  controlBorder: '#8B9AB0',
  track: '#334155',
  // Dark CTA: a #818CF8 fill with an ink label (5.98:1); white on it is 2.98:1 (§1.4, COL-1).
  action: '#818CF8',
  onAction: '#0F172A',
  actionPressed: '#A5B4FC',
  actionTint: '#312E81',
  onActionTint: '#E0E7FF',
  brandGround: '#1E1B4B',
  onBrandGround: '#F8FAFC',
  onBrandGroundSecondary: '#CBD5E1',
  brandGroundCta: '#818CF8',
  onBrandGroundCta: '#0F172A',
  link: '#A5B4FC',
  selection: '#312E81',
  onSelection: '#E0E7FF',
  selectionBorder: '#818CF8',
  meter: '#818CF8',
  onMeter: '#0F172A',
  onTier: '#0F172A',
  onAccent: ACCENT_ON_FILL.dark,
  success: '#4ADE80',
  onSuccess: '#0F172A',
  successText: '#4ADE80',
  dangerText: '#FCA5A5',
  dangerFill: '#F87171',
  onDanger: '#0F172A',
  dangerTint: '#3D3343',
  signature: '#F7B733',
  signatureText: '#F7B733',
  signatureTint: '#3A2F1A',
  tabActive: '#A5B4FC',
  tabInactive: '#94A3B8',
  toast: '#394353',
  onToast: '#F8FAFC',
  toastAction: '#A5B4FC',
  toastEdge: '#475569',
  disabledContainer: '#2C3647',
  onDisabled: '#A3B1C5',
  onCelebration: '#FFFFFF',
  onCelebrationSecondary: '#CBD5E1',
  switchThumb: '#CBD5E1',
  switchTrackOff: '#334155',
  appleButton: '#FFFFFF',
  onAppleButton: '#000000',
  scrim: 'rgba(0,0,0,0.60)',
  pressedOverlay: 'rgba(255,255,255,0.08)',
  ripple: 'rgba(255,255,255,0.16)',
  celebrationScrim: 'rgba(0,0,0,0.70)',
  shadow: '#000000',
};

// Particle colours: [success, signature, sky, pink, lime] fills of the theme.
light.celebration = [light.success, light.signature, ACCENTS.sky.light.fill, ACCENTS.pink.light.fill, ACCENTS.lime.light.fill];
dark.celebration = [dark.success, dark.signature, ACCENTS.sky.dark.fill, ACCENTS.pink.dark.fill, ACCENTS.lime.dark.fill];

export const palette = { light, dark };

// The roles declared as rgba(...) on purpose; every other colour role is opaque hex.
export const RGBA_ROLES = ['scrim', 'pressedOverlay', 'ripple', 'celebrationScrim'];

export const accents = ACCENTS;
export const accentOnFill = ACCENT_ON_FILL;

// Data ramp and state vocabulary (§2.4). Missed, rest, frozen and pending cells use
// `controlBorder`; the frozen glyph uses `textSecondary`.
// The heat* keys are the pre-§2.4 heat-map colours the Progress heat map and the habit detail
// grid still draw (partial amber, frozen sky, missed rose); V-02 moves both onto the ramp above.
const legacyHeat = { heatPartial: '#FDE68A', heatFrozen: '#7DD3FC', heatMissed: '#FCA5A5' };
export const data = {
  light: { partial: '#16A34A', perfect: '#14532D', todayRing: '#0F172A', ...legacyHeat },
  dark: { partial: '#16A34A', perfect: '#86EFAC', todayRing: '#F8FAFC', ...legacyHeat },
};

// Fixed, theme-independent brand colours (share cards, splash; VA-7).
export const brand = {
  indigo: '#4F46E5',
  indigoDeep: '#3730A3',
  ink: '#0F172A',
  splash: '#4F46E5',
};

// The share cards (Progress -> Share) are fixed brand art, the same in both themes (VA-7):
// white type on the brand indigo, or on ink for the year-in-pixels card.
export const shareCard = {
  bg: brand.indigo,
  bgDeep: brand.indigoDeep,
  bgInk: brand.ink,
  fg: '#FFFFFF',
  fgSecondary: 'rgba(255,255,255,0.8)',
  fgStrong: 'rgba(255,255,255,0.9)',
  fgTertiary: 'rgba(255,255,255,0.7)',
  well: 'rgba(255,255,255,0.14)',
  // Year-in-pixels cells on ink
  cellNone: '#1E293B',
  cellPartial: '#F59E0B',
  cellPerfect: '#818CF8',
};

// Celebration art, fixed in both themes: the confetti palettes and the milestone overlay's
// type on the habit colour. Moved verbatim out of CelebrationOverlay and CompletionCelebration
// (F-05); C-07 / C-08 redesign these moments.
export const celebrationArt = {
  confettiPerfectDay: ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'],
  confettiMilestone: [
    '#818CF8', '#A78BFA', '#C4B5FD', '#E879F9', '#34D399',
    '#FDE68A', '#FB923C', '#F472B6', '#60A5FA', '#FFFFFF',
  ],
  staticScrim: 'rgba(0,0,0,0.45)',
  title: '#FFFFFF',
  titleShadow: 'rgba(0,0,0,0.15)',
  subtitle: 'rgba(255,255,255,0.9)',
};

// §2.6
// sectionCompact: the gap above a list section label on short windows (height below
// size.ringTodayCompactBelow, the same breakpoint as the compact Today ring); lg (24) otherwise.
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48, gutter: 20, sectionCompact: 16 };

export const radius = { control: 8, cell: 4, card: 16, sheet: 24, pill: 999 };

export const size = {
  touchMin: { android: 48, ios: 44 },
  todayCardMin: 72,
  trailingSlot: 48,
  settingsRowMin: 52,
  tabBarContent: { android: 56, ios: 49 }, // plus the bottom inset
  checkCircle: 32, // drawn, inside a trailingSlot
  ringToday: 88,
  ringTodayStroke: 8,
  // Selected when the window height is below ringTodayCompactBelow (D-00 r6); no caption.
  ringTodayCompact: 76,
  ringTodayCompactStroke: 7,
  ringTodayCompactBelow: 700,
  ringCollapsed: 28,
};

// §2.8. Light-mode shadows; dark mode relies on the tonal ladder (bg, surface, raised,
// overlay) and keeps only the Android elevation for ordering.
export const elevation = {
  brandStrip: { shadowColor: light.shadow, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sheet: { shadowColor: light.shadow, shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  dialog: { shadowColor: light.shadow, shadowOpacity: 0.16, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
};

export const TEXT = 4.5; // normal text
export const LARGE = 3; // large text (>= 24 px, or >= 18.66 px bold) and non-text indicators

// Every declared fg/bg pair (§2.5). `fg` and `bg` name a role of the pair's theme, or
// `data.<key>`, or a literal colour. `on` is an optional opaque backdrop for an rgba `bg`.
// `min` is the threshold (null = exempt, e.g. disabled); `ratio` is the §2.5 value, which the
// test re-computes to two decimals, so the table and the code cannot drift apart.
const P = (theme, name, fg, bg, min, ratio, on) => ({ theme, name, fg, bg, min, ratio, ...(on ? { on } : {}) });

export const pairs = [
  // ── Light ──
  P('light', 'text on bg', 'text', 'bg', TEXT, 17.06),
  P('light', 'text on surface', 'text', 'surface', TEXT, 17.85),
  P('light', 'text on well', 'text', 'well', TEXT, 16.3),
  P('light', 'textSecondary on surface', 'textSecondary', 'surface', TEXT, 7.58),
  P('light', 'textSecondary on bg', 'textSecondary', 'bg', TEXT, 7.24),
  P('light', 'textSecondary on well', 'textSecondary', 'well', TEXT, 6.92),
  P('light', 'textTertiary on surface', 'textTertiary', 'surface', TEXT, 4.76),
  P('light', 'textTertiary on bg', 'textTertiary', 'bg', TEXT, 4.55),
  P('light', 'controlBorder vs surface', 'controlBorder', 'surface', LARGE, 3.47),
  P('light', 'controlBorder vs bg', 'controlBorder', 'bg', LARGE, 3.31),
  P('light', 'onAction on action', 'onAction', 'action', TEXT, 6.29),
  P('light', 'onAction on actionPressed', 'onAction', 'actionPressed', TEXT, 7.9),
  P('light', 'onActionTint on actionTint', 'onActionTint', 'actionTint', TEXT, 8.88),
  P('light', 'link on surface', 'link', 'surface', TEXT, 7.9),
  P('light', 'link on bg', 'link', 'bg', TEXT, 7.55),
  P('light', 'selectionBorder vs surface', 'selectionBorder', 'surface', LARGE, 6.29),
  P('light', 'onSelection on selection', 'onSelection', 'selection', TEXT, 8.88),
  P('light', 'successText on surface', 'successText', 'surface', TEXT, 5.02),
  P('light', 'success arc on surface', 'success', 'surface', LARGE, 5.02),
  P('light', 'onSuccess on success', 'onSuccess', 'success', TEXT, 5.02),
  P('light', 'dangerText on surface', 'dangerText', 'surface', TEXT, 6.47),
  P('light', 'dangerText on dangerTint', 'dangerText', 'dangerTint', TEXT, 5.91),
  P('light', 'onDanger on dangerFill', 'onDanger', 'dangerFill', TEXT, 4.83),
  P('light', 'signature on surface', 'signature', 'surface', LARGE, 3.93),
  P('light', 'signature on bg', 'signature', 'bg', LARGE, 3.76),
  P('light', 'signatureText on surface', 'signatureText', 'surface', TEXT, 5.93),
  P('light', 'signatureText on signatureTint', 'signatureText', 'signatureTint', TEXT, 5.59),
  P('light', 'tabActive on tab bar', 'tabActive', 'surface', TEXT, 6.29),
  P('light', 'tabInactive on tab bar', 'tabInactive', 'surface', TEXT, 4.76),
  P('light', 'onToast on toast', 'onToast', 'toast', TEXT, 13.98),
  P('light', 'toastAction on toast', 'toastAction', 'toast', TEXT, 7.34),
  P('light', 'onAction (onboarding text) on action', 'onAction', 'action', TEXT, 6.29),
  P('light', 'brand strip: text on brandSurface', 'text', 'brandSurface', TEXT, 14.49),
  P('light', 'brand strip: textSecondary on brandSurface', 'textSecondary', 'brandSurface', TEXT, 6.15),
  P('light', 'brand strip: success arc on brandSurface', 'success', 'brandSurface', LARGE, 4.07),
  P('light', 'brand strip: signature arc on brandSurface', 'signature', 'brandSurface', LARGE, 3.19),
  P('light', 'brand strip: signatureText on brandSurface', 'signatureText', 'brandSurface', TEXT, 4.81),
  P('light', 'brand strip: empty dashed ring (brandInk) on brandSurface', 'brandInk', 'brandSurface', LARGE, 8.06),
  P('light', 'brand strip: beat-row outlines (beatOutline) on brandSurface', 'beatOutline', 'brandSurface', LARGE, 8.06),
  P('light', 'onDisabled on disabledContainer (exempt)', 'onDisabled', 'disabledContainer', null, 6.15),
  P('light', 'data partial vs surface', 'data.partial', 'surface', LARGE, 3.3),
  P('light', 'data perfect vs surface', 'data.perfect', 'surface', LARGE, 9.11),
  P('light', 'data missed / frozen / rest outline vs surface', 'controlBorder', 'surface', LARGE, 3.47),
  P('light', 'frozen glyph / caution text (textSecondary) on surface', 'textSecondary', 'surface', TEXT, 7.58),
  P('light', 'today ring vs surface', 'data.todayRing', 'surface', LARGE, 17.85),
  P('light', 'trophy hint on celebrationScrim over bg', 'onCelebration', 'celebrationScrim', TEXT, 8.74, 'bg'),
  // F-02: the inverted CTA on action-coloured ground (onboarding), selected rows, meters, rewards
  P('light', 'onboarding: onBrandGround on brandGround', 'onBrandGround', 'brandGround', TEXT, 6.29),
  P('light', 'onboarding: onBrandGroundSecondary on brandGround', 'onBrandGroundSecondary', 'brandGround', TEXT, 5.1),
  P('light', 'onboarding CTA: onBrandGroundCta on brandGroundCta', 'onBrandGroundCta', 'brandGroundCta', TEXT, 6.29),
  P('light', 'text on selection', 'text', 'selection', TEXT, 15.97),
  P('light', 'textSecondary on selection', 'textSecondary', 'selection', TEXT, 6.78),
  P('light', 'selectionBorder vs selection', 'selectionBorder', 'selection', LARGE, 5.62),
  P('light', 'meter vs track', 'meter', 'track', LARGE, 5.1),
  P('light', 'onMeter (check) on meter', 'onMeter', 'meter', TEXT, 6.29),
  P('light', 'link on overlay', 'link', 'overlay', TEXT, 7.9),
  P('light', 'reward subtitle on celebrationScrim over bg', 'onCelebrationSecondary', 'celebrationScrim', TEXT, 5.89, 'bg'),
  P('light', 'onAppleButton on appleButton', 'onAppleButton', 'appleButton', TEXT, 21),
  P('light', 'off Switch: switchThumb vs switchTrackOff', 'switchThumb', 'switchTrackOff', LARGE, 3.47),
  P('light', 'onAccent (check) on the default accent (selectionBorder)', 'onAccent', 'selectionBorder', TEXT, 6.29),
  P('light', 'brand card: link (title) on brandSurface', 'link', 'brandSurface', TEXT, 6.41),
  P('light', 'brand card: text on brandSurface', 'text', 'brandSurface', TEXT, 14.49),
  // ── Dark ──
  P('dark', 'text on bg', 'text', 'bg', TEXT, 17.06),
  P('dark', 'text on surface', 'text', 'surface', TEXT, 13.98),
  P('dark', 'text on raised', 'text', 'raised', TEXT, 11.63),
  P('dark', 'text on overlay', 'text', 'overlay', TEXT, 9.55),
  P('dark', 'textSecondary on surface', 'textSecondary', 'surface', TEXT, 9.85),
  P('dark', 'textSecondary on overlay', 'textSecondary', 'overlay', TEXT, 6.73),
  P('dark', 'textSecondary on bg', 'textSecondary', 'bg', TEXT, 12.02),
  P('dark', 'textTertiary on surface', 'textTertiary', 'surface', TEXT, 6.72),
  P('dark', 'textTertiary on raised', 'textTertiary', 'raised', TEXT, 5.59),
  P('dark', 'textTertiary on overlay', 'textTertiary', 'overlay', TEXT, 4.59),
  P('dark', 'controlBorder vs surface', 'controlBorder', 'surface', LARGE, 5.12),
  P('dark', 'controlBorder vs bg', 'controlBorder', 'bg', LARGE, 6.25),
  P('dark', 'controlBorder vs raised', 'controlBorder', 'raised', LARGE, 4.26),
  P('dark', 'controlBorder vs overlay', 'controlBorder', 'overlay', LARGE, 3.5),
  P('dark', 'onAction (ink) on action', 'onAction', 'action', TEXT, 5.98),
  P('dark', 'onAction (ink) on actionPressed', 'onAction', 'actionPressed', TEXT, 8.96),
  P('dark', 'action fill boundary vs bg', 'action', 'bg', LARGE, 5.98),
  P('dark', 'action fill boundary vs surface', 'action', 'surface', LARGE, 4.9),
  P('dark', 'action fill boundary vs raised', 'action', 'raised', LARGE, 4.08),
  P('dark', 'onActionTint on actionTint', 'onActionTint', 'actionTint', TEXT, 9.27),
  P('dark', 'link on surface', 'link', 'surface', TEXT, 7.34),
  P('dark', 'link on bg', 'link', 'bg', TEXT, 8.96),
  P('dark', 'link on raised', 'link', 'raised', TEXT, 6.1),
  P('dark', 'selectionBorder vs surface', 'selectionBorder', 'surface', LARGE, 4.9),
  P('dark', 'onSelection on selection', 'onSelection', 'selection', TEXT, 9.27),
  P('dark', 'onSelection on raised', 'onSelection', 'raised', TEXT, 9.88),
  P('dark', 'successText on surface', 'successText', 'surface', TEXT, 8.4),
  P('dark', 'success arc on surface', 'success', 'surface', LARGE, 8.4),
  P('dark', 'onSuccess (ink) on success', 'onSuccess', 'success', TEXT, 10.25),
  P('dark', 'dangerText on surface', 'dangerText', 'surface', TEXT, 7.71),
  P('dark', 'dangerText on raised', 'dangerText', 'raised', TEXT, 6.41),
  P('dark', 'dangerText on overlay', 'dangerText', 'overlay', TEXT, 5.26),
  P('dark', 'onDanger (ink) on dangerFill', 'onDanger', 'dangerFill', TEXT, 6.45),
  P('dark', 'signature on surface', 'signature', 'surface', TEXT, 8.2),
  P('dark', 'signature on bg', 'signature', 'bg', TEXT, 10.01),
  P('dark', 'signature on signatureTint', 'signature', 'signatureTint', TEXT, 7.35),
  P('dark', 'text on signatureTint', 'text', 'signatureTint', TEXT, 12.53),
  P('dark', 'tabActive on tab bar', 'tabActive', 'surface', TEXT, 7.34),
  P('dark', 'tabInactive on tab bar', 'tabInactive', 'surface', TEXT, 5.71),
  P('dark', 'onToast on toast', 'onToast', 'toast', TEXT, 9.55),
  P('dark', 'toastAction on toast', 'toastAction', 'toast', TEXT, 5.01),
  P('dark', 'brand strip: text on brandSurface', 'text', 'brandSurface', TEXT, 15.28),
  P('dark', 'brand strip: textSecondary on brandSurface', 'textSecondary', 'brandSurface', TEXT, 10.77),
  P('dark', 'brand strip: success arc on brandSurface', 'success', 'brandSurface', LARGE, 9.17),
  P('dark', 'brand strip: signature arc on brandSurface', 'signature', 'brandSurface', LARGE, 8.96),
  P('dark', 'brand strip: empty dashed ring on brandSurface', 'brandInk', 'brandSurface', LARGE, 5.59),
  P('dark', 'brand strip: beat-row outlines (beatOutline) on brandSurface', 'beatOutline', 'brandSurface', LARGE, 5.59),
  P('dark', 'onDisabled on disabledContainer (exempt)', 'onDisabled', 'disabledContainer', null, 5.59),
  P('dark', 'data partial vs surface', 'data.partial', 'surface', LARGE, 4.44),
  P('dark', 'data perfect vs surface', 'data.perfect', 'surface', LARGE, 10.42),
  P('dark', 'data missed / frozen / rest outline vs surface', 'controlBorder', 'surface', LARGE, 5.12),
  P('dark', 'frozen glyph / caution text (textSecondary) on surface', 'textSecondary', 'surface', TEXT, 9.85),
  P('dark', 'today ring vs surface', 'data.todayRing', 'surface', LARGE, 13.98),
  P('dark', 'trophy hint on celebrationScrim over bg', 'onCelebration', 'celebrationScrim', TEXT, 20.14, 'bg'),
  P('dark', 'onboarding: onBrandGround on brandGround', 'onBrandGround', 'brandGround', TEXT, 15.28),
  P('dark', 'onboarding: onBrandGroundSecondary on brandGround', 'onBrandGroundSecondary', 'brandGround', TEXT, 10.77),
  P('dark', 'onboarding CTA: onBrandGroundCta (ink) on brandGroundCta', 'onBrandGroundCta', 'brandGroundCta', TEXT, 5.98),
  P('dark', 'onboarding CTA boundary vs brandGround', 'brandGroundCta', 'brandGround', LARGE, 5.36),
  P('dark', 'text on selection', 'text', 'selection', TEXT, 10.92),
  P('dark', 'textSecondary on selection', 'textSecondary', 'selection', TEXT, 7.69),
  P('dark', 'selectionBorder vs selection', 'selectionBorder', 'selection', LARGE, 3.83),
  P('dark', 'meter vs track', 'meter', 'track', LARGE, 3.47),
  P('dark', 'onMeter (ink check) on meter', 'onMeter', 'meter', TEXT, 5.98),
  P('dark', 'link on overlay', 'link', 'overlay', TEXT, 5.01),
  P('dark', 'reward subtitle on celebrationScrim over bg', 'onCelebrationSecondary', 'celebrationScrim', TEXT, 13.57, 'bg'),
  P('dark', 'onAppleButton on appleButton', 'onAppleButton', 'appleButton', TEXT, 21),
  P('dark', 'off Switch: switchThumb vs switchTrackOff', 'switchThumb', 'switchTrackOff', LARGE, 6.97),
  P('dark', 'off Switch thumb vs surface', 'switchThumb', 'surface', LARGE, 9.85),
  P('dark', 'onAccent (ink check) on the default accent (selectionBorder)', 'onAccent', 'selectionBorder', TEXT, 5.98),
  P('dark', 'brand card: link (title) on brandSurface', 'link', 'brandSurface', TEXT, 8.02),
];
