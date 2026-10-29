import { randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import { RMA_RETURN_RECEIPT_COMMAND_AUDIENCE, type RmaReturnReceiptCommandV1 } from '@gigalibs/contracts';
import { loadRelayConfig, type ModulePrincipal } from '@gigalibs/module-sdk';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export function isReturnsInventoryHandshakeConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  const configured = { ...environment };
  if (configured.UNIVERSAL_RETURNS_INVENTORY_RELAY_URL?.trim()) {
    configured.UNIVERSAL_RETURNS_INVENTORY_RMA_RETURN_RECEIPT_COMMAND_PATH ??=
      '/universal-inventory/internal/v1/rma-return-receipt-command';
  }
  const outbound = loadRelayConfig(configured, {
    inboxPublicKey: 'UNIVERSAL_RETURNS_INVENTORY_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'UNIVERSAL_RETURNS_INVENTORY_RELAY_URL',
    signingKey: 'UNIVERSAL_RETURNS_INVENTORY_RELAY_PRIVATE_KEY_BASE64',
    interval: 'UNIVERSAL_RETURNS_INVENTORY_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'UNIVERSAL_RETURNS_INVENTORY_RMA_RETURN_RECEIPT_COMMAND_PATH',
  }).outbound;
  return Boolean(outbound);
}

@Injectable()
export class InventoryHandshakeClient {
  async receiveReturnStock(principal: ModulePrincipal, request: RmaReturnReceiptCommandV1) {
    const environment = { ...process.env };
    if (environment.UNIVERSAL_RETURNS_INVENTORY_RELAY_URL?.trim() &&
        !environment.UNIVERSAL_RETURNS_INVENTORY_RMA_RETURN_RECEIPT_COMMAND_PATH?.trim()) {
      environment.UNIVERSAL_RETURNS_INVENTORY_RMA_RETURN_RECEIPT_COMMAND_PATH =
        '/universal-inventory/internal/v1/rma-return-receipt-command';
    }
    const config = loadRelayConfig(environment, {
      inboxPublicKey: 'UNIVERSAL_RETURNS_INVENTORY_RELAY_UNUSED_PUBLIC_KEY',
      targetUrl: 'UNIVERSAL_RETURNS_INVENTORY_RELAY_URL',
      signingKey: 'UNIVERSAL_RETURNS_INVENTORY_RELAY_PRIVATE_KEY_BASE64',
      interval: 'UNIVERSAL_RETURNS_INVENTORY_RELAY_INTERVAL_MS',
      peerService: 'module-host',
      inboxPath: 'UNIVERSAL_RETURNS_INVENTORY_RMA_RETURN_RECEIPT_COMMAND_PATH',
    });
    if (!config.outbound) {
      throw new ServiceUnavailableException({ code: 'UNIVERSAL_RETURNS_INVENTORY_HANDSHAKE_NOT_CONFIGURED' });
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
      { audience: RMA_RETURN_RECEIPT_COMMAND_AUDIENCE, source: 'universal-returns', tenantId: principal.tenantId, messageId, body },
      config.outbound.privateKey,
    );
    const response = await fetch(`${config.outbound.targetOrigin}${config.outbound.inboxPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException({ code: 'UNIVERSAL_RETURNS_INVENTORY_RECEIPT_UNAVAILABLE' });
    }
    return response.json() as Promise<{ receiptId: string; receiptNumber: string; financeCostProfileId: string }>;
  }
}
