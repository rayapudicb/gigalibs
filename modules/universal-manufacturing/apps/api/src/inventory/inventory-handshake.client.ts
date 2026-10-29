import { randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import { loadRelayConfig, type ModulePrincipal } from '@gigalibs/module-sdk';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

function relayConfig(environment: NodeJS.ProcessEnv = process.env) {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'MANUFACTURING_INVENTORY_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'MANUFACTURING_INVENTORY_RELAY_URL',
    signingKey: 'MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64',
    interval: 'MANUFACTURING_INVENTORY_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'MANUFACTURING_INVENTORY_RELAY_UNUSED_PATH',
  });
}

export function isManufacturingInventoryHandshakeConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(relayConfig(environment).outbound);
}

@Injectable()
export class InventoryHandshakeClient {
  private post(
    principal: ModulePrincipal,
    audience: string,
    inboxPathEnv: string,
    defaultPath: string,
    request: unknown,
  ) {
    const environment = { ...process.env };
    if (environment.MANUFACTURING_INVENTORY_RELAY_URL?.trim() && !environment[inboxPathEnv]?.trim()) {
      environment[inboxPathEnv] = defaultPath;
    }
    const config = loadRelayConfig(environment, {
      inboxPublicKey: 'MANUFACTURING_INVENTORY_RELAY_UNUSED_PUBLIC_KEY',
      targetUrl: 'MANUFACTURING_INVENTORY_RELAY_URL',
      signingKey: 'MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64',
      interval: 'MANUFACTURING_INVENTORY_RELAY_INTERVAL_MS',
      peerService: 'module-host',
      inboxPath: inboxPathEnv,
    });
    if (!config.outbound) {
      throw new ServiceUnavailableException({ code: 'MANUFACTURING_INVENTORY_HANDSHAKE_NOT_CONFIGURED' });
    }
    const messageId = randomUUID();
    const body = JSON.stringify({
      tenantId: principal.tenantId,
      messageId,
      actor: {
        subject: principal.subject,
        sessionId: principal.sessionId,
        authVersion: principal.authVersion,
        permissions: principal.permissions,
        roles: principal.roles,
        persona: principal.persona,
        organization: principal.organization,
        departmentScope: principal.departmentScope,
        placeScope: principal.placeScope,
      },
      request,
    });
    const token = signRelayToken(
      { audience, source: 'universal-manufacturing', tenantId: principal.tenantId, messageId, body },
      config.outbound.privateKey,
    );
    return fetch(`${config.outbound.targetOrigin}${config.outbound.inboxPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  }

  async issueLine(
    principal: ModulePrincipal,
    input: {
      reservationId: string;
      productionOrderId: string;
      productionLineId: string;
      quantity?: string;
      correlationId?: string;
    },
  ) {
    const response = await this.post(
      principal,
      'gigalibs-universal-inventory-issue-demand-command',
      'MANUFACTURING_INVENTORY_ISSUE_DEMAND_COMMAND_PATH',
      '/universal-inventory/internal/v1/issue-demand-command',
      input,
    );
    if (!response.ok) {
      throw new ServiceUnavailableException({ code: 'MANUFACTURING_INVENTORY_ISSUE_UNAVAILABLE' });
    }
    return response.json() as Promise<{ issueId: string; issuedQuantity: string; status: string }>;
  }

  async receiveFinishedGoods(
    principal: ModulePrincipal,
    input: {
      commandKey: string;
      productionOrderId: string;
      warehouseId: string;
      productId: string;
      uomId: string;
      quantity: string;
    },
  ) {
    const response = await this.post(
      principal,
      'gigalibs-universal-inventory-production-receipt-command',
      'MANUFACTURING_INVENTORY_PRODUCTION_RECEIPT_COMMAND_PATH',
      '/universal-inventory/internal/v1/production-receipt-command',
      input,
    );
    if (!response.ok) {
      throw new ServiceUnavailableException({ code: 'MANUFACTURING_INVENTORY_RECEIPT_UNAVAILABLE' });
    }
    return response.json() as Promise<{ receiptId: string; receiptNumber: string }>;
  }
}
