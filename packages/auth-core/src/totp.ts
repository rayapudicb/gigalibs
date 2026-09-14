import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_PERIOD_SECONDS = 30;

export interface TotpOptions {
  digits?: number;
  periodSeconds?: number;
}

export function generateTotpSecret(byteLength = 20): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 20 || byteLength > 64) {
    throw new Error('TOTP secrets must contain between 20 and 64 random bytes.');
  }
  return encodeBase32(randomBytes(byteLength));
}

export function createTotpUri(secret: string, issuer: string, account: string): string {
  decodeBase32(secret);
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: String(DEFAULT_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

export function generateTotpCode(
  secret: string,
  timestampMs = Date.now(),
  options: TotpOptions = {},
): string {
  const digits = options.digits ?? 6;
  const periodSeconds = options.periodSeconds ?? DEFAULT_PERIOD_SECONDS;
  if (!Number.isSafeInteger(digits) || digits < 6 || digits > 8) {
    throw new Error('TOTP digits must be between 6 and 8.');
  }
  if (!Number.isSafeInteger(periodSeconds) || periodSeconds < 15 || periodSeconds > 300) {
    throw new Error('TOTP period must be between 15 and 300 seconds.');
  }
  const step = BigInt(Math.floor(timestampMs / 1_000 / periodSeconds));
  return codeForStep(secret, step, digits);
}

export function matchTotpStep(
  code: string,
  secret: string,
  timestampMs = Date.now(),
  window = 1,
): bigint | null {
  if (!/^\d{6}$/.test(code) || !Number.isSafeInteger(window) || window < 0 || window > 2) {
    return null;
  }
  const currentStep = BigInt(Math.floor(timestampMs / 1_000 / DEFAULT_PERIOD_SECONDS));
  const supplied = Buffer.from(code, 'ascii');
  for (let offset = -window; offset <= window; offset += 1) {
    const candidateStep = currentStep + BigInt(offset);
    if (candidateStep < 0n) continue;
    const candidate = Buffer.from(codeForStep(secret, candidateStep, 6), 'ascii');
    if (candidate.length === supplied.length && timingSafeEqual(candidate, supplied)) {
      return candidateStep;
    }
  }
  return null;
}

function codeForStep(secret: string, step: bigint, digits: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(step);
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

function encodeBase32(input: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/, '');
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error('TOTP secret must be unpadded RFC 4648 base32.');
  }
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (output.length < 20) throw new Error('TOTP secret must contain at least 160 bits.');
  return Buffer.from(output);
}
