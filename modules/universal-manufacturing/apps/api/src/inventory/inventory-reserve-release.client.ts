import { randomUUID } from 'node:crypto';
import {
  InventoryReserveReleaseResponseV1Schema,
  type InventoryReserveReleaseRequestV1,
} from '@gigalibs/contracts';
import { signRelayToken } from '@gigalibs/auth-core';
import { loadRelayConfig, type ModulePrincipal } from '@gigalibs/module-sdk';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export function isManufacturingInventoryReserveReleaseConfigured(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    loadRelayConfig(environment, {
      inboxPublicKey: 'MANUFACTURING_INVENTORY_RELAY_UNUSED_PUBLIC_KEY',
      targetUrl: 'MANUFACTURING_INVENTORY_RELAY_URL',
      signingKey: 'MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64',
      interval: 'MANUFACTURING_INVENTORY_RELAY_INTERVAL_MS',
      peerService: 'module-host',
      inboxPath: 'MANUFACTURING_INVENTORY_RESERVE_RELEASE_COMMAND_PATH',
    }).outbound,
  );
}

@Injectable()
export class InventoryReserveReleaseClient {
  async execute(principal: ModulePrincipal, request: InventoryReserveReleaseRequestV1) {
    const environment = { ...process.env };
    if (
      environment.MANUFACTURING_INVENTORY_RELAY_URL?.trim() &&
      !environment.MANUFACTURING_INVENTORY_RESERVE_RELEASE_COMMAND_PATH?.trim()
    ) {
      environment.MANUFACTURING_INVENTORY_RESERVE_RELEASE_COMMAND_PATH =
        '/universal-inventory/internal/v1/reserve-release-command';
    }
    const config = loadRelayConfig(environment, {
      inboxPublicKey: 'MANUFACTURING_INVENTORY_RELAY_UNUSED_PUBLIC_KEY',
      targetUrl: 'MANUFACTURING_INVENTORY_RELAY_URL',
      signingKey: 'MANUFACTURING_INVENTORY_RELAY_PRIVATE_KEY_BASE64',
      interval: 'MANUFACTURING_INVENTORY_RELAY_INTERVAL_MS',
      peerService: 'module-host',
      inboxPath: 'MANUFACTURING_INVENTORY_RESERVE_RELEASE_COMMAND_PATH',
    });
    if (!config.outbound) {
      throw new ServiceUnavailableException({ code: 'MANUFACTURING_INVENTORY_RESERVE_RELEASE_NOT_CONFIGURED' });
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
        audience: 'gigalibs-universal-inventory-reserve-release-command',
        source: 'universal-manufacturing',
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
      throw new ServiceUnavailableException({ code: 'MANUFACTURING_INVENTORY_RESERVE_RELEASE_UNAVAILABLE' });
    }
    const parsed = InventoryReserveReleaseResponseV1Schema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ServiceUnavailableException({ code: 'MANUFACTURING_INVENTORY_RESERVE_RELEASE_INVALID' });
    }
    return parsed.data;
  }
}
