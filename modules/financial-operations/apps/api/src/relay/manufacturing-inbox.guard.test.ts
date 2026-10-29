import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FinanceRelayInboxGuard } from './inbox.guard.js';
import { loadFinanceRelayConfig } from './relay-config.js';
import {
  FINANCE_MANUFACTURING_INBOX_AUDIENCE,
  FinanceManufacturingInboxGuard,
  loadFinanceManufacturingInboxConfig,
} from './manufacturing-inbox.guard.js';

const pair = () => {
  const keys = generateKeyPairSync('ed25519');
  return {
    publicBase64: keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privatePem: keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
};
const inventory = pair();
const manufacturing = pair();
const inventoryGuard = new FinanceRelayInboxGuard(loadFinanceRelayConfig({
  FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64: inventory.publicBase64,
}));
const manufacturingGuard = new FinanceManufacturingInboxGuard(loadFinanceManufacturingInboxConfig({
  FINANCE_MANUFACTURING_INBOX_PUBLIC_KEY_BASE64: manufacturing.publicBase64,
}));

function request(source: string, audience: string, privatePem: string) {
  const body = { tenantId: 'tenant-a', messageId: randomUUID() };
  const raw = JSON.stringify(body);
  const token = signRelayToken({ audience, source, tenantId: body.tenantId,
    messageId: body.messageId, body: raw }, privatePem, 60);
  return { headers: { authorization: `Bearer ${token}` }, rawBody: Buffer.from(raw), body };
}
function accepts(guard: FinanceRelayInboxGuard | FinanceManufacturingInboxGuard, req: object) {
  return guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext);
}

describe('Finance inbox identity isolation', () => {
  it('accepts Manufacturing only with its own key and route', () => {
    const manufacturingRequest = request('universal-manufacturing', FINANCE_MANUFACTURING_INBOX_AUDIENCE,
      manufacturing.privatePem);
    expect(accepts(manufacturingGuard, manufacturingRequest)).toBe(true);
    expect(() => accepts(inventoryGuard, manufacturingRequest)).toThrow();
    const inventoryRequest = request('inventory', 'gigalibs-finance-inbox', inventory.privatePem);
    expect(accepts(inventoryGuard, inventoryRequest)).toBe(true);
    expect(() => accepts(manufacturingGuard, inventoryRequest)).toThrow();
  });
});
