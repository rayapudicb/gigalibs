/**
 * Cross-platform isomorphic random bytes generator (Browser & Node.js).
 */
export const getRandomBytes = (size: number): Uint8Array => {
  if (!Number.isSafeInteger(size) || size < 1 || size > 1_048_576) {
    throw new Error('Random byte size must be an integer between 1 and 1048576.');
  }
  const bytes = new Uint8Array(size);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  throw new Error('A cryptographically secure random source is unavailable.');
};

export const bytesToHex = (bytes: Uint8Array): string => {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
};

export const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return Buffer.from(bytes).toString('base64url');
};
