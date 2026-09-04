import { randomInt } from 'node:crypto';

export interface OtpGenerationOptions {
  ttlSeconds?: number;
  maxAttempts?: number;
}

export interface GeneratedOtp {
  code: string;
  expiresAt: Date;
  maxAttempts: number;
}

export function createOtp(options?: OtpGenerationOptions): GeneratedOtp {
  const ttl = options?.ttlSeconds ?? 300; // 5 minutes
  const maxAttempts = options?.maxAttempts ?? 5;
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = new Date(Date.now() + ttl * 1000);

  return {
    code,
    expiresAt,
    maxAttempts,
  };
}

export function isOtpExpired(expiresAt: Date): boolean {
  return Date.now() > expiresAt.getTime();
}
