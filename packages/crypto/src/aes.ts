import { bytesToBase64Url, getRandomBytes } from './random-bytes.js';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const VERSION = 'v1';

export const encrypt = async (
  plaintext: string,
  base64Key: string,
  authenticatedContext: string,
): Promise<string> => {
  const crypto = requireWebCrypto();
  const key = await importKey(crypto, base64Key, ['encrypt']);
  const iv = getRandomBytes(IV_LENGTH);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(new TextEncoder().encode(requireContext(authenticatedContext))),
      tagLength: 128,
    },
    key,
    toArrayBuffer(new TextEncoder().encode(plaintext)),
  );
  return `${VERSION}.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
};

export const decrypt = async (
  envelope: string,
  base64Key: string,
  authenticatedContext: string,
): Promise<string> => {
  const [version, encodedIv, encodedCiphertext, unexpected] = envelope.split('.');
  if (version !== VERSION || !encodedIv || !encodedCiphertext || unexpected) {
    throw new Error('Encrypted envelope format is invalid.');
  }
  const crypto = requireWebCrypto();
  const key = await importKey(crypto, base64Key, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64UrlToBytes(encodedIv)),
      additionalData: toArrayBuffer(new TextEncoder().encode(requireContext(authenticatedContext))),
      tagLength: 128,
    },
    key,
    toArrayBuffer(base64UrlToBytes(encodedCiphertext)),
  );
  return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
};

function requireWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto AES-GCM is unavailable.');
  return globalThis.crypto;
}

async function importKey(
  crypto: Crypto,
  base64Key: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const bytes = canonicalBase64ToBytes(base64Key);
  if (bytes.length !== KEY_LENGTH) throw new Error('AES-GCM key must contain exactly 32 bytes.');
  return crypto.subtle.importKey('raw', toArrayBuffer(bytes), { name: 'AES-GCM' }, false, usages);
}

function requireContext(value: string): string {
  if (!value) throw new Error('AES-GCM authenticated context is required.');
  return value;
}

function canonicalBase64ToBytes(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('AES-GCM key must be canonical base64.');
  }
  const bytes = binaryToBytes(globalThis.atob(value));
  if (bytesToCanonicalBase64(bytes) !== value) throw new Error('AES-GCM key is not canonical base64.');
  return bytes;
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Encrypted envelope is not base64url.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return binaryToBytes(globalThis.atob(base64));
}

function binaryToBytes(binary: string): Uint8Array {
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToCanonicalBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
