import { getRandomBytes, bytesToHex, bytesToBase64Url } from './random-bytes.js';

/**
 * Generate a UUID v4 (Isomorphic Web Crypto / Node.js).
 */
export const uuid = (): string => {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = getRandomBytes(16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // Version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // Variant 10
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Generate a time-sortable unique ID using crypto random.
 * Format: timestamp(ms, 8 hex chars) + random(16 hex chars)
 * Sortable lexicographically, URL-safe, 24 chars.
 * Use as default primary key for most entities.
 */
export const generateId = (): string => {
  const ts = Date.now().toString(16).padStart(8, '0');
  const rand = bytesToHex(getRandomBytes(8));
  return `${ts}${rand}`;
};

/**
 * Generate a short random token (URL-safe base64, no padding).
 * Use for invite codes, short tokens (not security-critical).
 */
export const generateShortToken = (bytes = 12): string =>
  bytesToBase64Url(getRandomBytes(bytes));

/**
 * Generate a secure random token (hex string).
 * Use for password reset tokens, email verification tokens.
 */
export const generateSecureToken = (bytes = 32): string =>
  bytesToHex(getRandomBytes(bytes));
