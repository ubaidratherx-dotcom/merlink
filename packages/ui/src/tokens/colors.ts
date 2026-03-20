/**
 * Mercury Design System v2.0 - Color Tokens
 * Platform-agnostic color definitions for web and React Native.
 */

export const lightColors = {
  backgroundPrimary: '#FFFFFF',
  backgroundSecondary: '#F5F5F7',
  backgroundTertiary: '#EFEFEF',
  surfaceCard: '#FFFFFF',
  textPrimary: '#0B0B0C',
  textSecondary: '#3C3C43',
  textTertiary: '#8E8E93',
  textLink: '#7B5EFF',
} as const;

export const darkColors = {
  backgroundPrimary: '#0B0B0C',
  surfaceCard: '#1C1C1E',
  surface2: '#2C2C2E',
  textPrimary: '#F2F2F7',
  textSecondary: '#AEAEB2',
  textTertiary: '#636366',
} as const;

export const auroraGradient = {
  auroraStart: '#7B5EFF',
  auroraEnd: '#3BBFFF',
  auroraDirection: '135deg',
  auroraSolid: '#7B5EFF',
  auroraTint: '#EDE9FF',
} as const;

export const semanticColors = {
  signalGreen: '#16C784',
  alertRed: '#FF453A',
  warningAmber: '#FF9F0A',
} as const;

export const borderColors = {
  border: '#E5E5EA',
  divider: '#F2F2F7',
} as const;

export const badgeColors = {
  kycVerifiedBg: '#E8FBF3',
  inPersonBg: '#EDE9FF',
  remoteBg: '#F5F5F7',
  disputeBg: '#FFF0EF',
  dangerBg: '#FFF0EF',
} as const;

export const colors = {
  light: lightColors,
  dark: darkColors,
  aurora: auroraGradient,
  semantic: semanticColors,
  border: borderColors,
  badge: badgeColors,
} as const;

export type LightColors = typeof lightColors;
export type DarkColors = typeof darkColors;
export type AuroraGradient = typeof auroraGradient;
export type SemanticColors = typeof semanticColors;
export type BorderColors = typeof borderColors;
export type BadgeColors = typeof badgeColors;
