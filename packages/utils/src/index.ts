/**
 * @merlink/utils - Shared utility functions for the Merlink platform
 */

/**
 * Truncates a wallet address to show first 4 and last 4 characters.
 * Example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" -> "9WzD...AWWM"
 */
export function formatWalletAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Calculates protocol fee at 0.5% of the given amount.
 */
export function calculateProtocolFee(amount: number): number {
  return amount * 0.005;
}

/**
 * Checks whether the given date is in the past.
 */
export function isExpired(date: Date): boolean {
  return date.getTime() < Date.now();
}

/**
 * Generates a unique trade ID prefixed with "TRD-".
 */
export function generateTradeId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `TRD-${timestamp}-${random}`;
}

/**
 * Calculates the great-circle distance between two points on Earth
 * using the Haversine formula.
 * @returns Distance in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Sanitizes a username: lowercases, trims whitespace, and removes special characters.
 * Only alphanumeric characters, underscores, and hyphens are kept.
 */
export function sanitizeUsername(username: string): string {
  return username
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "");
}

/**
 * Blocked content patterns for chat messages.
 * Prevents users from sharing contact info to circumvent the platform.
 */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    reason: "Phone numbers are not allowed in chat messages",
  },
  {
    // Matches "telegram", "t.me", and spaced-out variants like "t e l e g r a m"
    pattern: /\b(telegram|t\.me)\b|t\s*e\s*l\s*e\s*g\s*r\s*a\s*m/i,
    reason: "Telegram references are not allowed in chat messages",
  },
  {
    pattern: /\bwhatsapp\b|w\s*h\s*a\s*t\s*s\s*a\s*p\s*p/i,
    reason: "WhatsApp references are not allowed in chat messages",
  },
  {
    pattern: /\bdiscord\b|d\s*i\s*s\s*c\s*o\s*r\s*d/i,
    reason: "Discord references are not allowed in chat messages",
  },
  {
    // Matches number words like "five five five" and digit sequences
    pattern: /\b(my\s+number\s+is|call\s+me|text\s+me|reach\s+me)\b/i,
    reason: "Sharing contact information is not allowed",
  },
  {
    pattern: /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/,
    reason: "Wallet addresses are not allowed in chat messages",
  },
  {
    pattern: /https?:\/\/[^\s]+/i,
    reason: "Links are not allowed in chat messages",
  },
  {
    pattern: /www\.[^\s]+/i,
    reason: "Links are not allowed in chat messages",
  },
];

/**
 * Checks whether a chat message contains blocked content such as
 * phone numbers, external platform references, wallet addresses, or links.
 */
export function containsBlockedContent(message: string): {
  blocked: boolean;
  reason: string | null;
} {
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(message)) {
      return { blocked: true, reason };
    }
  }
  return { blocked: false, reason: null };
}

/**
 * Formats a numeric amount as a currency string.
 * Defaults to USD if no currency code is provided.
 */
export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Clamps a value between a minimum and maximum bound.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
