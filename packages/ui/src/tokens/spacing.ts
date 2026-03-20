/**
 * Mercury Design System v2.0 - Spacing Tokens
 * Platform-agnostic spacing, layout, and radius definitions.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const layout = {
  columns: 4,
  gutter: 16,
  margin: 20,
} as const;

export const radius = {
  sm: 6,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
} as const;

export type Spacing = typeof spacing;
export type SpacingKey = keyof Spacing;
export type Layout = typeof layout;
export type Radius = typeof radius;
export type RadiusKey = keyof Radius;
