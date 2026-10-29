import { randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import {
  InventoryAtpCheckResponseV1Schema,
  type InventoryAtpCheckRequestV1,
} from '@gigalibs/contracts';
import { loadRelayConfig, type ModulePrincipal } from '@gigalibs/module-sdk';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const PATH = '/universal-inventory/internal/v1/manufacturing-atp-command';
const AUDIENCE = 'gigalibs-universal-inventory-manufacturing-atp-command';

@Injectable()
export class InventoryAtpClient {
  async check(principal: ModulePrincipal, request: InventoryAtpCheckRequestV1) {
    const env = { ...process.env };
    if (env.MANUFACTURING_INVENTORY_RELAY_URL?.trim()) {
      env.MANUFACTURING_INVENTORY_ATP_COMMAND_PATH ??= PATH;
    }
    const config = loadRelayConfig(env, {
      inboxPublicKey: 'MANUFACTURING_INVENTORY_RELAY_UNUSED_PUBLIC_KEY',
      targetUrl: 'MANUFACTURING_INVENTORY_RELAY_URL',
      signingKey: 'MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64',
      interval: 'MANUFACTURING_INVENTORY_RELAY_INTERVAL_MS',
      peerService: 'module-host',
      inboxPath: 'MANUFACTURING_INVENTORY_ATP_COMMAND_PATH',
    });
    if (!config.outbound) throw new ServiceUnavailableException({ code: 'MANUFACTURING_ATP_NOT_CONFIGURED' });
    const messageId = randomUUID();
    const body = JSON.stringify({
      tenantId: principal.tenantId, messageId,
      actor: {
        subject: principal.subject, sessionId: principal.sessionId, authVersion: principal.authVersion,
        permissions: principal.permissions, roles: principal.roles, persona: principal.persona,
        organization: principal.organization, departmentScope: principal.departmentScope,
        placeScope: principal.placeScope,
      },
      request,
    });
    const token = signRelayToken({ audience: AUDIENCE, source: 'universal-manufacturing',
      tenantId: principal.tenantId, messageId, body }, config.outbound.privateKey);
    const response = await fetch(`${config.outbound.targetOrigin}${config.outbound.inboxPath}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body, signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new ServiceUnavailableException({ code: 'MANUFACTURING_ATP_UNAVAILABLE' });
    const parsed = InventoryAtpCheckResponseV1Schema.safeParse(await response.json());
    if (!parsed.success) throw new ServiceUnavailableException({ code: 'MANUFACTURING_ATP_INVALID' });
    return parsed.data;
  }
}
