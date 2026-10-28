import { randomUUID } from 'node:crypto';
import { signRelayToken } from '@gigalibs/auth-core';
import { loadRelayConfig } from '@gigalibs/module-sdk';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

const FinanceAccountReference = z.object({
  accountId: z.uuid(),
  accountingBookId: z.uuid(),
  accountClass: z.enum(['ASSET', 'LIABILITY']),
  version: z.number().int().positive(),
}).strict();

export type CheckedFinanceAccount = z.infer<typeof FinanceAccountReference>;

/** A live, signed read at the Finance authority before a partner account can name a control account. */
@Injectable()
export class FinanceAccountReferenceClient {
  async check(tenantId: string, accountId: string, accountClass: 'ASSET' | 'LIABILITY'): Promise<CheckedFinanceAccount> {
    const environment = { ...process.env };
    environment.BUSINESS_PARTNERS_FINANCE_INBOX_PATH ||= '/financial-operations/internal/v1/account-reference';
    let config;
    try {
      config = loadRelayConfig(environment, {
        inboxPublicKey: 'BUSINESS_PARTNERS_FINANCE_UNUSED_PUBLIC_KEY',
        targetUrl: 'BUSINESS_PARTNERS_FINANCE_URL',
        signingKey: 'FINANCE_ACCOUNT_REF_INBOX_PRIVATE_KEY_BASE64',
        interval: 'BUSINESS_PARTNERS_FINANCE_RELAY_INTERVAL_MS',
        peerService: 'module-host',
        inboxPath: 'BUSINESS_PARTNERS_FINANCE_INBOX_PATH',
      });
    } catch {
      throw unavailable();
    }
    if (!config.outbound) throw unavailable();
    const messageId = randomUUID();
    const body = JSON.stringify({ tenantId, messageId, accountId, accountClass });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const token = signRelayToken({
          audience: 'gigalibs-finance-account-reference', source: 'business-partners',
          tenantId, messageId, body,
        }, config.outbound.privateKey);
        const response = await fetch(`${config.outbound.targetOrigin}${config.outbound.inboxPath}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body,
          signal: AbortSignal.timeout(3_000),
        });
        if (response.status === 400 || response.status === 404) {
          throw new BadRequestException({ code: 'BUSINESS_PARTNERS_ACCOUNT_REFERENCE_INVALID' });
        }
        if (!response.ok) {
          if (attempt === 0 && (response.status === 408 || response.status === 429 || response.status >= 500)) continue;
          throw unavailable();
        }
        const parsed = FinanceAccountReference.safeParse(await response.json());
        if (!parsed.success || parsed.data.accountId !== accountId || parsed.data.accountClass !== accountClass) {
          throw unavailable();
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        if (attempt === 1) throw unavailable();
      }
    }
    throw unavailable();
  }
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({ code: 'BUSINESS_PARTNERS_FINANCE_REFERENCE_UNAVAILABLE' });
}
