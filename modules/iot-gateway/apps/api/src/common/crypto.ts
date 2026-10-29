import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export function newApiCredentials(): { credential: string; hint: string; secretHash: string } {
  const credential = randomBytes(32).toString('base64url');
  const hint = credential.slice(-8);
  const secretHash = hashSecret(credential);
  return { credential, hint, secretHash };
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function verifyHmac(secret: string, rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const provided = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
