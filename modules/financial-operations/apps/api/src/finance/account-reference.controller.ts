import { RelayInboxGuardBase, type RelayConfig, type RelayRequest, loadRelayConfig } from '@gigalibs/module-sdk';
import { BadRequestException, Body, Controller, Inject, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { FinanceService } from './finance.service.js';

export const FINANCE_ACCOUNT_REFERENCE_CONFIG = Symbol('FINANCE_ACCOUNT_REFERENCE_CONFIG');
export const FINANCE_ACCOUNT_REFERENCE_AUDIENCE = 'gigalibs-finance-account-reference';

export function loadFinanceAccountReferenceConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'FINANCE_ACCOUNT_REF_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'FINANCE_ACCOUNT_REF_UNUSED_TARGET_URL',
    signingKey: 'FINANCE_ACCOUNT_REF_UNUSED_SIGNING_KEY',
    interval: 'FINANCE_ACCOUNT_REF_UNUSED_INTERVAL_MS',
    peerService: 'module-host',
  });
}

@Injectable()
export class FinanceAccountReferenceGuard extends RelayInboxGuardBase {
  constructor(@Inject(FINANCE_ACCOUNT_REFERENCE_CONFIG) config: RelayConfig) {
    super(config, { audience: FINANCE_ACCOUNT_REFERENCE_AUDIENCE, source: 'business-partners', label: 'Finance account reference' });
  }
}

const AccountReferenceRequest = z.object({
  tenantId: z.string().min(1).max(64),
  messageId: z.uuid(),
  accountId: z.uuid(),
  accountClass: z.enum(['ASSET', 'LIABILITY']),
}).strict();

/** Live Finance-owned validation; account configuration never moves into Business Partner storage. */
@Controller('internal/v1/account-reference')
@UseGuards(FinanceAccountReferenceGuard)
export class FinanceAccountReferenceController {
  constructor(private readonly finance: FinanceService) {}

  @Post()
  async check(@Req() _request: RelayRequest, @Body() body: unknown) {
    const parsed = AccountReferenceRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'FINANCE_ACCOUNT_REFERENCE_INVALID' });
    const { tenantId, accountId, accountClass } = parsed.data;
    const account = await this.finance.getAccount(tenantId, accountId);
    if (!account.active || !account.isSubledgerControl || account.accountClass !== accountClass) {
      throw new BadRequestException({ code: 'FINANCE_ACCOUNT_REFERENCE_UNAPPROVED' });
    }
    return {
      accountId: account.id,
      accountingBookId: account.accountingBookId,
      accountClass: account.accountClass,
      version: account.version,
    };
  }
}
