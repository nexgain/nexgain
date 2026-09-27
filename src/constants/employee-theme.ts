/**
 * Light palette for the Employee section. The Owner section uses the dark
 * palette in theme.ts; spacing and radius values are shared from there.
 */

export const EmployeeColors = {
  background: '#F4F6FA',
  card: '#FFFFFF',
  border: '#E6E9EF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  primary: '#2563EB',
  primarySoft: '#EAF1FF',
  success: '#16A34A',
  successSoft: '#E8F7EE',
  danger: '#DC2626',
  dangerSoft: '#FDECEC',
} as const;

export const cardShadow = {
  boxShadow: '0px 2px 8px rgba(15, 23, 42, 0.06)',
} as const;
