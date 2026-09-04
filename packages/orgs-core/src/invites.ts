import { generateSecureToken } from '@gigalibs/crypto';
import type { InviteDetails } from './types.js';

export function createInvite(
  tenantId: string,
  email: string,
  role: string,
  invitedById: string,
  ttlDays = 7,
): { token: string; invite: InviteDetails } {
  const token = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  return {
    token,
    invite: {
      tenantId,
      email: email.toLowerCase().trim(),
      role,
      invitedById,
      expiresAt,
    },
  };
}

export function isInviteExpired(expiresAt: Date): boolean {
  return Date.now() > expiresAt.getTime();
}
