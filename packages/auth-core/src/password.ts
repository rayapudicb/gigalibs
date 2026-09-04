import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface PasswordPolicy {
  minLength?: number;
  maxLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecial?: boolean;
}

const defaultPolicy: PasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSpecial: false,
};

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 } as const;

const derivePasswordKey = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });

export function validatePasswordStrength(password: string, policy: PasswordPolicy = defaultPolicy): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const effectivePolicy = { ...defaultPolicy, ...policy };
  const minLength = effectivePolicy.minLength ?? 12;
  const maxLength = effectivePolicy.maxLength ?? 128;

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  if (password.length > maxLength) {
    errors.push(`Password must be at most ${maxLength} characters long`);
  }
  if (effectivePolicy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (effectivePolicy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (effectivePolicy.requireNumber && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (effectivePolicy.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const validation = validatePasswordStrength(password);
  if (!validation.isValid) {
    throw new Error(validation.errors.join('; '));
  }

  const salt = randomBytes(16);
  const derivedKey = await derivePasswordKey(password, salt);
  return [
    'scrypt-v1',
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, saltEncoded, hashEncoded] = stored.split('$');
  if (
    algorithm !== 'scrypt-v1' ||
    n !== String(SCRYPT_OPTIONS.N) ||
    r !== String(SCRYPT_OPTIONS.r) ||
    p !== String(SCRYPT_OPTIONS.p) ||
    !saltEncoded ||
    !hashEncoded
  ) {
    return false;
  }

  const expected = Buffer.from(hashEncoded, 'base64url');
  const actual = await derivePasswordKey(password, Buffer.from(saltEncoded, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
