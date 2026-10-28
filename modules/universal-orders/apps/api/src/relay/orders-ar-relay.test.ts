import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadOrdersArRelayConfig } from './orders-ar-relay.js';

const { privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { format: 'der', type: 'spki' },
  privateKeyEncoding: { format: 'der', type: 'pkcs8' },
});

describe('Orders fulfillment to AR relay configuration', () => {
  it('targets only the AR inbox with a configured Ed25519 key', () => {
    expect(loadOrdersArRelayConfig({})).toMatchObject({ outbound: null });
    expect(loadOrdersArRelayConfig({
      ORDERS_AR_RELAY_URL: 'http://ar-api:3400',
      ORDERS_AR_RELAY_PRIVATE_KEY_BASE64: privateKey.toString('base64'),
    }).outbound).toMatchObject({
      targetOrigin: 'http://ar-api:3400',
      inboxPath: '/internal/v1/orders-fulfillments',
    });
  });

  it('rejects a foreign host and a half-configured relay', () => {
    expect(() => loadOrdersArRelayConfig({
      ORDERS_AR_RELAY_URL: 'http://foreign.example',
      ORDERS_AR_RELAY_PRIVATE_KEY_BASE64: privateKey.toString('base64'),
    })).toThrow();
    expect(() => loadOrdersArRelayConfig({ ORDERS_AR_RELAY_URL: 'http://ar-api:3400' })).toThrow();
  });
});
