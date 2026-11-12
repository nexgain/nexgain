/**
 * NexGain's colours: clean white with bright blue, used across the whole app
 * (owner, employee, login and sign-up screens). Change a colour here and it
 * changes everywhere. Spacing and radius values are shared from here too.
 */

/** Every colour in the app's theme. */
export const Palette = {
  // Backgrounds
  page: '#F5F7FA',
  card: '#FFFFFF',
  cardBorder: '#E6EAF0',
  cardShadow: '0px 2px 8px rgba(15, 23, 42, 0.06)',
  divider: '#E6EAF0',
  /** Dimmed screen behind pop-ups and bottom sheets. */
  overlay: 'rgba(15, 23, 42, 0.45)',

  // Primary blue
  primary: '#0B63E5',
  primaryPressed: '#0A52BF',
  /** Light blue tint: icon tiles, info boxes, date chips. */
  primarySoft: '#EAF2FF',
  onPrimary: '#FFFFFF',

  // Text
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',

  // Status: strong text/icon, soft background, border
  success: '#16A34A',
  successSoft: '#EAFBF0',
  successBorder: '#BFEFD0',
  warning: '#F59E0B',
  warningSoft: '#FFF7E8',
  warningBorder: '#FDE3B5',
  danger: '#DC2626',
  dangerSoft: '#FDECEC',
  dangerBorder: '#F7C6C6',
  info: '#0B63E5',
  infoSoft: '#EAF2FF',
  infoBorder: '#C9DCFB',
  neutral: '#475569',
  neutralSoft: '#E9EDF2',

  // Controls
  /** Segmented controls, secondary buttons, the back button circle. */
  track: '#EEF1F5',
  inputBackground: '#FFFFFF',
  inputBorder: '#D9DFE7',
  inputFocus: '#0B63E5',

  /** Behind the NexGain logo, whose "NEX" is white (the AI avatar, the sign-up sidebar). */
  logoBackground: '#0B0D12',
} as const;

/** Owner screens. */
export const Colors = {
  background: Palette.page,
  surface: Palette.card,
  /** Secondary buttons, the back button and other raised controls. */
  surfaceRaised: Palette.track,
  border: Palette.cardBorder,
  text: Palette.text,
  textSecondary: Palette.textSecondary,
  textMuted: Palette.textMuted,
  accent: Palette.primary,
  accentPressed: Palette.primaryPressed,
  accentSoft: Palette.primarySoft,
  onAccent: Palette.onPrimary,
  success: Palette.success,
  successSoft: Palette.successSoft,
  successBorder: Palette.successBorder,
  warning: Palette.warning,
  warningSoft: Palette.warningSoft,
  warningBorder: Palette.warningBorder,
  danger: Palette.danger,
  dangerSoft: Palette.dangerSoft,
  dangerBorder: Palette.dangerBorder,
  infoBorder: Palette.infoBorder,
  neutral: Palette.neutral,
  neutralSoft: Palette.neutralSoft,
  inputBorder: Palette.inputBorder,
  overlay: Palette.overlay,
  cardShadow: Palette.cardShadow,
  logoBackground: Palette.logoBackground,
} as const;

export const Spacing = {
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 20,
  pill: 999,
} as const;

/** Text sizes. Use these instead of typing font sizes into screens. */
export const FontSize = {
  caption: 12,
  small: 13,
  body: 15,
  large: 17,
  heading: 20,
  title: 24,
  pageTitle: 28,
} as const;

/** Shadows, from flat to floating. */
export const Shadow = {
  card: Palette.cardShadow,
  raised: '0px 6px 20px rgba(15, 23, 42, 0.08)',
  popover: '0px 18px 48px rgba(15, 23, 42, 0.18)',
} as const;

/**
 * Sizes for the computer (web, wide window) layout. Phones never use these:
 * see useIsDesktop() in src/hooks/use-desktop.ts.
 */
export const Desktop = {
  /** Window width (px) from which the web app switches to the computer layout. */
  minWidth: 1024,
  sidebarWidth: 248,
  /** Widest the page content gets, centred in the space beside the sidebar. */
  contentMaxWidth: 1160,
  /** Forms and single-column detail pages read best at this width. */
  formMaxWidth: 760,
  pagePaddingX: 40,
  pagePaddingTop: 32,
  /** Buttons keep a sensible size instead of stretching across the page. */
  buttonMinWidth: 140,
  buttonMaxWidth: 360,
  buttonHeight: 42,
  /** Pop-ups (bottom sheets on phones) show as a centred dialog this wide. */
  dialogWidth: 520,
} as const;
