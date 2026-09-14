import { createHash, randomBytes } from 'node:crypto';

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_CHARACTERS = 20;

export function generateMfaRecoveryCode(): string {
  const entropy = randomBytes(RECOVERY_CODE_CHARACTERS);
  const characters = Array.from(entropy, (byte) => RECOVERY_ALPHABET[byte & 31]).join('');
  return characters.match(/.{4}/g)?.join('-') ?? characters;
}

export function normalizeMfaRecoveryCode(code: string): string | null {
  const normalized = code.trim().toUpperCase().replaceAll('-', '');
  return /^[A-HJ-NP-Z2-9]{20}$/.test(normalized) ? normalized : null;
}

export function hashMfaRecoveryCode(code: string, userId: string): string | null {
  const normalized = normalizeMfaRecoveryCode(code);
  if (!normalized || !userId) return null;
  return createHash('sha256')
    .update(`gigalibs:mfa-recovery:v1:${userId}:${normalized}`)
    .digest('hex');
}
