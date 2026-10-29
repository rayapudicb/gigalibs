import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashSecret, newApiCredentials, verifyHmac } from './crypto.js';

describe('device credential crypto', () => {
  it('hashes and verifies HMAC signatures', () => {
    const creds = newApiCredentials();
    expect(hashSecret(creds.credential)).toBe(creds.secretHash);
    const body = Buffer.from(JSON.stringify({ readings: [] }));
    const signature = `sha256=${createHmac('sha256', creds.credential).update(body).digest('hex')}`;
    expect(verifyHmac(creds.credential, body, signature)).toBe(true);
    expect(verifyHmac(creds.credential, body, 'sha256=deadbeef')).toBe(false);
  });
});
