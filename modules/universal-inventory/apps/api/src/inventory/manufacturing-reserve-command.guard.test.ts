import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  MANUFACTURING_RESERVE_COMMAND_AUDIENCE,
  ManufacturingReserveCommandGuard,
  loadManufacturingReserveCommandConfig,
} from './manufacturing-reserve-command.guard.js';
import { ReserveReleaseCommandGuard, loadReserveReleaseCommandConfig } from './reserve-release-command.guard.js';
import {
  MANUFACTURING_ATP_COMMAND_AUDIENCE, ManufacturingAtpCommandGuard,
  loadManufacturingAtpCommandConfig,
} from './manufacturing-atp-command.guard.js';

const pair = () => {
  const keys = generateKeyPairSync('ed25519');
  return {
    publicBase64: keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    privatePem: keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
};
const orders = pair();
const manufacturing = pair();
const ordersGuard = new ReserveReleaseCommandGuard(loadReserveReleaseCommandConfig({
  INVENTORY_RESERVE_RELEASE_COMMAND_INBOX_PUBLIC_KEY_BASE64: orders.publicBase64,
}));
const manufacturingGuard = new ManufacturingReserveCommandGuard(loadManufacturingReserveCommandConfig({
  INVENTORY_MANUFACTURING_RESERVE_COMMAND_INBOX_PUBLIC_KEY_BASE64: manufacturing.publicBase64,
}));
const manufacturingAtpGuard = new ManufacturingAtpCommandGuard(loadManufacturingAtpCommandConfig({
  INVENTORY_MANUFACTURING_RESERVE_COMMAND_INBOX_PUBLIC_KEY_BASE64: manufacturing.publicBase64,
}));

function request(source: string, audience: string, privatePem: string) {
  const body = { tenantId: 'tenant-a', messageId: randomUUID() };
  const raw = JSON.stringify(body);
  const token = signRelayToken({ audience, source, tenantId: body.tenantId,
    messageId: body.messageId, body: raw }, privatePem, 60);
  return { headers: { authorization: `Bearer ${token}` }, rawBody: Buffer.from(raw), body };
}
function accepts(guard: ReserveReleaseCommandGuard | ManufacturingReserveCommandGuard | ManufacturingAtpCommandGuard, req: object) {
  return guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext);
}

describe('Inventory reserve inbox identity isolation', () => {
  it('accepts each relay only on its own route', () => {
    const manufacturingRequest = request('universal-manufacturing', MANUFACTURING_RESERVE_COMMAND_AUDIENCE,
      manufacturing.privatePem);
    expect(accepts(manufacturingGuard, manufacturingRequest)).toBe(true);
    expect(() => accepts(ordersGuard, manufacturingRequest)).toThrow();
    const ordersRequest = request('universal-orders', 'gigalibs-universal-inventory-reserve-release-command',
      orders.privatePem);
    expect(accepts(ordersGuard, ordersRequest)).toBe(true);
    expect(() => accepts(manufacturingGuard, ordersRequest)).toThrow();
  });

  it('binds Manufacturing ATP to a distinct audience', () => {
    const atp = request('universal-manufacturing', MANUFACTURING_ATP_COMMAND_AUDIENCE,
      manufacturing.privatePem);
    expect(accepts(manufacturingAtpGuard, atp)).toBe(true);
    expect(() => accepts(manufacturingGuard, atp)).toThrow();
    expect(() => accepts(ordersGuard, atp)).toThrow();
  });
});
