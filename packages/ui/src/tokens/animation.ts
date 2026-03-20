/**
 * Mercury Design System v2.0 - Animation Tokens
 * Platform-agnostic animation definitions for web and React Native.
 */

export const springPresets = {
  snappy: {
    tension: 300,
    friction: 26,
  },
  default: {
    tension: 170,
    friction: 26,
  },
  gentle: {
    tension: 120,
    friction: 14,
  },
  bouncy: {
    tension: 400,
    friction: 10,
  },
} as const;

export const duration = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 450,
  xSlow: 600,
  pageTransition: 350,
  modalEntry: 400,
  modalExit: 250,
  skeletonPulse: 1500,
  toastDisplay: 3000,
} as const;

export const interaction = {
  buttonPress: {
    scale: 0.97,
    duration: 100,
    spring: springPresets.snappy,
  },
  cardPress: {
    scale: 0.98,
    duration: 150,
    spring: springPresets.default,
  },
  listItemSwipe: {
    spring: springPresets.snappy,
  },
  fabExpand: {
    spring: springPresets.bouncy,
  },
  switchToggle: {
    spring: springPresets.snappy,
  },
  pullToRefresh: {
    spring: springPresets.gentle,
  },
} as const;

export const animation = {
  spring: springPresets,
  duration,
  interaction,
} as const;

export type SpringPresets = typeof springPresets;
export type SpringKey = keyof SpringPresets;
export type Duration = typeof duration;
export type DurationKey = keyof Duration;
export type Interaction = typeof interaction;
