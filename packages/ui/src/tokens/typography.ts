/**
 * Mercury Design System v2.0 - Typography Tokens
 * Platform-agnostic typography definitions for web and React Native.
 */

export const typography = {
  fontFamily: {
    ios: 'SF Pro Display',
    android: 'Inter',
    web: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace",
  },

  scale: {
    display: {
      fontSize: 34,
      lineHeight: 41,
      fontWeight: '700' as const,
      letterSpacing: 0.37,
    },
    h1: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '700' as const,
      letterSpacing: 0.36,
    },
    h2: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700' as const,
      letterSpacing: 0.35,
    },
    h3: {
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '600' as const,
      letterSpacing: 0.38,
    },
    bodyPrimary: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '400' as const,
      letterSpacing: -0.41,
    },
    bodySecondary: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '400' as const,
      letterSpacing: -0.24,
    },
    caption: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '400' as const,
      letterSpacing: -0.08,
    },
    micro: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: '500' as const,
      letterSpacing: 0.07,
    },
    button: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600' as const,
      letterSpacing: -0.41,
    },
    monoAddress: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500' as const,
      letterSpacing: 0,
    },
  },
} as const;

export type Typography = typeof typography;
export type FontFamily = typeof typography.fontFamily;
export type TypeScale = typeof typography.scale;
export type TypeScaleKey = keyof TypeScale;
