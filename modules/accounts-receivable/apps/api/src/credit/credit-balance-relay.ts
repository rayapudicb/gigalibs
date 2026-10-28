import { OutboxRelay, loadRelayConfig } from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export function loadArCreditRelayConfig(environment: NodeJS.ProcessEnv = process.env) {
  const env = { ...environment };
  if (env.AR_CREDIT_RELAY_URL?.trim() && !env.AR_CREDIT_RELAY_INBOX_PATH?.trim()) {
    env.AR_CREDIT_RELAY_INBOX_PATH = '/business-partners/internal/v1/credit-inbox';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'AR_CREDIT_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'AR_CREDIT_RELAY_URL',
    signingKey: 'AR_CREDIT_RELAY_PRIVATE_KEY_BASE64',
    interval: 'AR_CREDIT_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'AR_CREDIT_RELAY_INBOX_PATH',
  });
}

@Injectable()
export class ArCreditBalanceRelay extends OutboxRelay<'relay_lease_credit_balances' | 'relay_settle_credit_balance'> {
  constructor(database: DatabaseService) {
    super(database, loadArCreditRelayConfig(), {
      leaseFunction: 'relay_lease_credit_balances',
      settleFunction: 'relay_settle_credit_balance',
      audience: 'gigalibs-business-partners-credit-inbox',
      source: 'accounts-receivable',
      notConfiguredMessage: 'AR credit relay is not configured; invoice balance facts remain queued.',
    });
  }
}
