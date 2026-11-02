import { createHash, randomBytes } from 'node:crypto';

// Server-side pass secret helpers (not re-exported from frontline/index — safe for Next.js client bundles).

export function hashContractorPassSecret(passSecret: string): string {
  if (!/^[a-f0-9]{64}$/.test(passSecret)) throw new Error('passSecret must be 64 lowercase hex characters.');
  return createHash('sha256').update(passSecret).digest('hex');
}

export function generateContractorPassSecret(): string {
  return randomBytes(32).toString('hex');
}
