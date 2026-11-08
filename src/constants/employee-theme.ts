/**
 * Employee screens' colours. They come from the app-wide theme in theme.ts,
 * so the Owner and Employee sections always match; spacing and radius values
 * are shared from there too.
 */
import { Palette } from '@/constants/theme';

export const EmployeeColors = {
  background: Palette.page,
  card: Palette.card,
  border: Palette.cardBorder,
  text: Palette.text,
  textSecondary: Palette.textSecondary,
  textMuted: Palette.textMuted,
  primary: Palette.primary,
  primaryPressed: Palette.primaryPressed,
  primarySoft: Palette.primarySoft,
  onPrimary: Palette.onPrimary,
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
  track: Palette.track,
  divider: Palette.divider,
  inputBorder: Palette.inputBorder,
  overlay: Palette.overlay,
} as const;

export const cardShadow = {
  boxShadow: Palette.cardShadow,
} as const;
