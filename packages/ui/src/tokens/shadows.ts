/**
 * Mercury Design System v2.0 - Shadow Tokens
 * Platform-agnostic shadow definitions for web and React Native.
 *
 * Each shadow is defined with platform-neutral properties:
 * - offsetX, offsetY: shadow offset
 * - blurRadius: blur spread
 * - color: shadow color with opacity
 * - opacity: shadow opacity (used by React Native)
 */

export interface ShadowValue {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadRadius: number;
  color: string;
  opacity: number;
}

export const lightShadows = {
  card: {
    offsetX: 0,
    offsetY: 2,
    blurRadius: 8,
    spreadRadius: 0,
    color: '#0B0B0C',
    opacity: 0.04,
  },
  cardHover: {
    offsetX: 0,
    offsetY: 8,
    blurRadius: 24,
    spreadRadius: 0,
    color: '#0B0B0C',
    opacity: 0.08,
  },
  primaryButton: {
    offsetX: 0,
    offsetY: 4,
    blurRadius: 16,
    spreadRadius: 0,
    color: '#7B5EFF',
    opacity: 0.3,
  },
  tradePanel: {
    offsetX: 0,
    offsetY: 4,
    blurRadius: 20,
    spreadRadius: 0,
    color: '#0B0B0C',
    opacity: 0.06,
  },
  frostedModal: {
    offsetX: 0,
    offsetY: 12,
    blurRadius: 40,
    spreadRadius: 0,
    color: '#0B0B0C',
    opacity: 0.12,
  },
} as const;

export const darkShadows = {
  card: {
    offsetX: 0,
    offsetY: 2,
    blurRadius: 8,
    spreadRadius: 0,
    color: '#000000',
    opacity: 0.2,
  },
  cardHover: {
    offsetX: 0,
    offsetY: 8,
    blurRadius: 24,
    spreadRadius: 0,
    color: '#000000',
    opacity: 0.32,
  },
  primaryButton: {
    offsetX: 0,
    offsetY: 4,
    blurRadius: 16,
    spreadRadius: 0,
    color: '#7B5EFF',
    opacity: 0.4,
  },
  tradePanel: {
    offsetX: 0,
    offsetY: 4,
    blurRadius: 20,
    spreadRadius: 0,
    color: '#000000',
    opacity: 0.24,
  },
  frostedModal: {
    offsetX: 0,
    offsetY: 12,
    blurRadius: 40,
    spreadRadius: 0,
    color: '#000000',
    opacity: 0.4,
  },
} as const;

export const shadows = {
  light: lightShadows,
  dark: darkShadows,
} as const;

export type LightShadows = typeof lightShadows;
export type DarkShadows = typeof darkShadows;
export type ShadowKey = keyof LightShadows;
