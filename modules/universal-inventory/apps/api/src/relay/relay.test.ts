/**
 * WI-OI-120fq (F2.1): Inventory → Finance outbox relay configuration (module-host path prefix).
 */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadInventoryFinanceRelayConfig } from './relay-config.js';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'der', type: 'spki' },
    privateKeyEncoding: { format: 'der', type: 'pkcs8' },
  });
  return { publicBase64: publicKey.toString('base64'), privateBase64: privateKey.toString('base64') };
}

describe('Inventory → Finance relay configuration', () => {
  it('stays off without keys and targets module-host with the Finance inbox path', () => {
    expect(loadInventoryFinanceRelayConfig({})).toMatchObject({ inboxPublicKey: null, outbound: null, intervalMs: 1_000 });
    const keys = keyPair();
    const loaded = loadInventoryFinanceRelayConfig({
      INVENTORY_RELAY_FINANCE_URL: 'http://127.0.0.1:4790',
      FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64: keys.privateBase64,
    });
    expect(loaded.outbound).toMatchObject({
      targetOrigin: 'http://127.0.0.1:4790',
      inboxPath: '/financial-operations/internal/v1/inbox',
    });
  });

  it('refuses a foreign relay origin', () => {
    const keys = keyPair();
    expect(() =>
      loadInventoryFinanceRelayConfig({
        INVENTORY_RELAY_FINANCE_URL: 'http://evil.example:4790',
        FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64: keys.privateBase64,
      }),
    ).toThrow();
  });
});
