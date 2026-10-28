import { randomUUID } from 'node:crypto';
import { InventoryAtpCheckResponseV1Schema, type InventoryAtpCheckRequestV1 } from '@gigalibs/contracts';
import { signRelayToken } from '@gigalibs/auth-core';
import { loadRelayConfig, type ModulePrincipal } from '@gigalibs/module-sdk';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export function isOrdersInventoryAtpCheckConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    loadRelayConfig(environment, {
      inboxPublicKey: 'ORDERS_INVENTORY_RELAY_UNUSED_PUBLIC_KEY',
      targetUrl: 'ORDERS_INVENTORY_RELAY_URL',
      signingKey: 'ORDERS_INVENTORY_RELAY_PRIVATE_KEY_BASE64',
      interval: 'ORDERS_INVENTORY_RELAY_INTERVAL_MS',
      peerService: 'module-host',
      inboxPath: 'ORDERS_INVENTORY_ATP_CHECK_COMMAND_PATH',
    }).outbound,
  );
}

@Injectable()
export class InventoryAtpCheckClient {
  async check(principal: ModulePrincipal, request: InventoryAtpCheckRequestV1) {
    const environment = { ...process.env };
    if (environment.ORDERS_INVENTORY_RELAY_URL?.trim() && !environment.ORDERS_INVENTORY_ATP_CHECK_COMMAND_PATH?.trim()) {
      environment.ORDERS_INVENTORY_ATP_CHECK_COMMAND_PATH =
        '/universal-inventory/internal/v1/atp-check-command';
    }
    const config = loadRelayConfig(environment, {
      inboxPublicKey: 'ORDERS_INVENTORY_RELAY_UNUSED_PUBLIC_KEY',
      targetUrl: 'ORDERS_INVENTORY_RELAY_URL',
      signingKey: 'ORDERS_INVENTORY_RELAY_PRIVATE_KEY_BASE64',
      interval: 'ORDERS_INVENTORY_RELAY_INTERVAL_MS',
      peerService: 'module-host',
      inboxPath: 'ORDERS_INVENTORY_ATP_CHECK_COMMAND_PATH',
    });
    if (!config.outbound) {
      throw new ServiceUnavailableException({
        code: 'ORDERS_INVENTORY_ATP_CHECK_NOT_CONFIGURED',
      });
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
      {
        audience: 'gigalibs-universal-inventory-atp-check-command',
        source: 'universal-orders',
        tenantId: principal.tenantId,
        messageId,
        body,
      },
      config.outbound.privateKey,
    );
    const response = await fetch(`${config.outbound.targetOrigin}${config.outbound.inboxPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException({ code: 'ORDERS_INVENTORY_ATP_CHECK_UNAVAILABLE' });
    }
    const parsed = InventoryAtpCheckResponseV1Schema.safeParse(await response.json());
    if (!parsed.success) throw new ServiceUnavailableException({ code: 'ORDERS_INVENTORY_ATP_CHECK_INVALID' });
    return parsed.data;
  }
}
