import { randomUUID } from 'node:crypto';
import { PartnerCreditCheckResponseV1Schema, type PartnerCreditCheckRequestV1 } from '@gigalibs/contracts';
import { signRelayToken } from '@gigalibs/auth-core';
import { loadRelayConfig, type ModulePrincipal } from '@gigalibs/module-sdk';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadOrdersCreditRelayConfig } from '../relay/orders-credit-relay.js';

export function isOrdersCreditCheckConfigured(environment: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(loadOrdersCreditRelayConfig(environment).outbound);
}

@Injectable()
export class BusinessPartnersCreditCheckClient {
  async check(principal: ModulePrincipal, request: PartnerCreditCheckRequestV1) {
    const environment = { ...process.env };
    if (environment.ORDERS_CREDIT_RELAY_URL?.trim() && !environment.ORDERS_CREDIT_CHECK_COMMAND_PATH?.trim()) {
      environment.ORDERS_CREDIT_CHECK_COMMAND_PATH = '/business-partners/internal/v1/credit-check-command';
    }
    const config = loadRelayConfig(environment, {
      inboxPublicKey: 'ORDERS_CREDIT_RELAY_UNUSED_PUBLIC_KEY',
      targetUrl: 'ORDERS_CREDIT_RELAY_URL',
      signingKey: 'ORDERS_CREDIT_RELAY_PRIVATE_KEY_BASE64',
      interval: 'ORDERS_CREDIT_RELAY_INTERVAL_MS',
      peerService: 'module-host',
      inboxPath: 'ORDERS_CREDIT_CHECK_COMMAND_PATH',
    });
    if (!config.outbound) {
      throw new ServiceUnavailableException({
        code: 'ORDERS_CREDIT_CHECK_NOT_CONFIGURED',
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
        audience: 'gigalibs-business-partners-credit-check-command',
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
      throw new ServiceUnavailableException({ code: 'ORDERS_CREDIT_CHECK_UNAVAILABLE' });
    }
    const parsed = PartnerCreditCheckResponseV1Schema.safeParse(await response.json());
    if (!parsed.success) throw new ServiceUnavailableException({ code: 'ORDERS_CREDIT_CHECK_INVALID' });
    return parsed.data;
  }
}
