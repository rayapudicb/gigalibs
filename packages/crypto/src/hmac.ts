import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { bytesToHex } from './random-bytes.js';

export const signHmac = (secret: string, payload: string): string => {
  if (!secret) throw new Error('HMAC secret is required.');
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(payload)));
};

export const verifyHmac = (secret: string, payload: string, signature: string): boolean => {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return safeCompare(signHmac(secret, payload), signature.toLowerCase());
};

export const safeCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
};
