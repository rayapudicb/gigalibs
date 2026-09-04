import { createHash, randomBytes } from 'node:crypto';

export interface RefreshTokenResult {
  refreshToken: string;
  expiresAt: Date;
}

export function generateRefreshToken(ttlDays = 30): RefreshTokenResult {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  return {
    refreshToken: token,
    expiresAt,
  };
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

export function isSessionExpired(expiresAt: Date): boolean {
  return Date.now() > expiresAt.getTime();
}
